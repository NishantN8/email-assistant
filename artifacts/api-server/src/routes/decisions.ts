import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, emailsTable, aiDecisionsTable, senderMemoryTable } from "@workspace/db";
import { CreateDecisionBody } from "@workspace/api-zod";
import { routeTask, callLocalLlm, allQueueStats, getCacheStats, runSwarmAnalysis, QueueFullError } from "../ai/index.js";
import { callBestCloudProvider } from "../ai/cloud-providers.js";
import { createTaskForEmail } from "../services/taskEngine.js";

const router: IRouter = Router();

// ─────────────────────────────────────────────
// STAGE 1: Fast rule-based classifier
// ─────────────────────────────────────────────
function fastClassify(email: {
  subject: string;
  fromEmail: string;
  body: string;
  labels: string[];
}): { category: string; urgencyScore: number; urgency: string } {
  const text = `${email.subject} ${email.body}`.toLowerCase();
  const from = email.fromEmail.toLowerCase();

  // CRITICAL patterns
  const criticalPatterns = [
    /\b(otp|verification code|security code|auth code)\b/,
    /\b(payment failed|payment declined|charge failed|billing error)\b/,
    /\b(account suspended|account locked|unauthorized access|security alert)\b/,
    /\b(deployment failed|build failed|production error|down alert)\b/,
  ];
  for (const p of criticalPatterns) {
    if (p.test(text)) return { category: "CRITICAL", urgencyScore: 90, urgency: "critical" };
  }

  // TRANSACTIONS
  if (
    /\b(order confirmed|receipt|invoice|payment receipt|your bill|subscription renewal|charge of \$)\b/.test(text) ||
    /\b(no.reply@email\.apple|billing@amazon|stripe\.com|paypal\.com)\b/.test(from)
  ) {
    return { category: "TRANSACTIONS", urgencyScore: 40, urgency: "medium" };
  }

  // PROMOTIONS
  if (
    /\b(unsubscribe|off|sale|discount|deal|promo|flash sale|limited time|coupon)\b/.test(text) ||
    email.labels.includes("PROMOTIONS") ||
    email.labels.includes("CATEGORY_PROMOTIONS")
  ) {
    return { category: "PROMOTIONS", urgencyScore: 5, urgency: "low" };
  }

  // SOCIAL
  if (
    /\b(accepted your|connected with|mentioned you|liked your|commented on|new follower)\b/.test(text) ||
    /linkedin|twitter|facebook|instagram/.test(from)
  ) {
    return { category: "SOCIAL", urgencyScore: 10, urgency: "low" };
  }

  return { category: "PRIMARY", urgencyScore: 50, urgency: "medium" };
}

// ─────────────────────────────────────────────
// STAGE 2: Weighted priority scoring model
// ─────────────────────────────────────────────
function weightedPriorityScore(params: {
  senderScore: number;     // 0-1 (from sender_memory.importance_score)
  replyRate: number;       // 0-1
  openRate: number;        // 0-1
  ignoreRate: number;      // 0-1
  urgencyScore: number;    // 0-100
  recencyScore: number;    // 0-1 (1 = just received, 0 = old)
}): number {
  const {
    senderScore,
    replyRate,
    openRate,
    ignoreRate,
    urgencyScore,
    recencyScore,
  } = params;

  // Normalise urgency to 0-1 range
  const urgencyNorm = urgencyScore / 100;

  // Weighted formula from spec
  const raw =
    senderScore * 0.25 +
    replyRate * 0.20 +
    openRate * 0.15 +
    urgencyNorm * 0.20 +
    recencyScore * 0.10 -
    ignoreRate * 0.10;

  // Clamp 0-1, then scale to 0-100
  return Math.round(Math.min(1, Math.max(0, raw)) * 100);
}

// ─────────────────────────────────────────────
// STAGE 3: Deep reasoning — routes via AI engine
// ─────────────────────────────────────────────
async function deepReason(email: {
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
  labels: string[];
  baseCategory: string;
  baseScore: number;
  senderImportance: number;
}): Promise<{
  category: string;
  priorityScore: number;
  urgency: string;
  recommendedAction: string;
  confidence: number;
  reason: string;
  summary: string;
  keyPoints: string[];
  modelSource: string;
}> {
  const systemPrompt = `You are an elite AI email analysis engine. You receive pre-scored emails and produce refined decisions.

Rules (apply in order):
1. CRITICAL: OTP, security alerts, payment failures → category CRITICAL, priority 90-100
2. Human colleagues, interview invites, deadlines → reply
3. Receipts, orders, bills → track  
4. Marketing, newsletters → read_later or archive

Output ONLY valid JSON:
{
  "category": "PRIMARY"|"CRITICAL"|"TRANSACTIONS"|"PROMOTIONS"|"SOCIAL"|"LOW_PRIORITY",
  "priority_score": 0-100,
  "urgency": "critical"|"high"|"medium"|"low",
  "recommended_action": "reply"|"ignore"|"archive"|"track"|"read_later",
  "confidence": 0.0-1.0,
  "reason": "max 15 words",
  "summary": "2-3 sentences",
  "key_points": ["concise point 1", "concise point 2", "concise point 3"]
}`;

  const userMessage = `Pre-score: ${email.baseScore}/100  Category: ${email.baseCategory}  Sender importance: ${email.senderImportance.toFixed(2)}

From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Labels: ${email.labels.join(", ")}

${email.body || email.snippet}`;

  // Ask the router whether to use local LLM or cloud
  const routing = await routeTask("deep-reasoning", email.baseScore);

  try {
    let text = "{}";
    let modelUsed = "cloud";

    if (routing.tier === "local") {
      const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
      const localResp = await callLocalLlm(fullPrompt, { timeoutMs: 15_000 });
      text = localResp.text;
      modelUsed = `local:${localResp.model}`;
    } else {
      const cloudResp = await callBestCloudProvider(userMessage, systemPrompt);
      text = cloudResp.text;
      modelUsed = `cloud:${cloudResp.provider}:${cloudResp.model}`;
    }

    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      category: parsed.category || email.baseCategory,
      priorityScore: Math.min(100, Math.max(0, parsed.priority_score ?? email.baseScore)),
      urgency: parsed.urgency || "medium",
      recommendedAction: parsed.recommended_action || "read_later",
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
      reason: parsed.reason || "AI analysis complete",
      summary: parsed.summary || "",
      keyPoints: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      modelSource: modelUsed,
    };
  } catch {
    // If local LLM failed and fallback is allowed, retry with cloud
    if (routing.tier === "local" && routing.fallbackAllowed) {
      try {
        const cloudResp = await callBestCloudProvider(userMessage, systemPrompt);
        const parsed = JSON.parse(cloudResp.text.replace(/```json|```/g, "").trim());
        return {
          category: parsed.category || email.baseCategory,
          priorityScore: Math.min(100, Math.max(0, parsed.priority_score ?? email.baseScore)),
          urgency: parsed.urgency || "medium",
          recommendedAction: parsed.recommended_action || "read_later",
          confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.7)),
          reason: parsed.reason || "AI analysis complete (cloud fallback)",
          summary: parsed.summary || "",
          keyPoints: Array.isArray(parsed.key_points) ? parsed.key_points : [],
          modelSource: `cloud:${cloudResp.provider}:fallback`,
        };
      } catch {
        /* fall through */
      }
    }

    return {
      category: email.baseCategory,
      priorityScore: email.baseScore,
      urgency: "medium",
      recommendedAction: "read_later",
      confidence: 0.6,
      reason: "Rule-based classification applied",
      summary: email.snippet,
      keyPoints: [],
      modelSource: "local:rules",
    };
  }
}

// ─────────────────────────────────────────────
// Full pipeline
// ─────────────────────────────────────────────
async function runDecisionPipeline(email: {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
  labels: string[];
  receivedAt: Date;
}) {
  // Pull sender memory
  const senderRows = await db
    .select()
    .from(senderMemoryTable)
    .where(eq(senderMemoryTable.fromEmail, email.fromEmail))
    .limit(1);

  const mem = senderRows[0];
  const senderScore = mem?.importanceScore ?? 0.5;
  const totalEmails = mem?.totalEmails ?? 1;
  const replyRate = totalEmails > 0 ? (mem?.replyCount ?? 0) / totalEmails : 0;
  const openRate = totalEmails > 0 ? (mem?.openCount ?? 0) / totalEmails : 0;
  const ignoreRate = totalEmails > 0 ? (mem?.ignoreCount ?? 0) / totalEmails : 0;

  // Recency: 1.0 = <1hr, 0.5 = <12hr, 0.2 = <48hr, 0.0 = older
  const ageHours = (Date.now() - email.receivedAt.getTime()) / (1000 * 60 * 60);
  const recencyScore = ageHours < 1 ? 1.0 : ageHours < 12 ? 0.7 : ageHours < 48 ? 0.4 : 0.1;

  // Stage 1: Fast classify
  const { category: baseCategory, urgencyScore, urgency: baseUrgency } = fastClassify({
    subject: email.subject,
    fromEmail: email.fromEmail,
    body: email.body || email.snippet,
    labels: email.labels,
  });

  // Stage 2: Weighted score
  const baseScore = weightedPriorityScore({
    senderScore,
    replyRate,
    openRate,
    ignoreRate,
    urgencyScore,
    recencyScore,
  });

  // Stage 3: Deep reason — only for high priority (score >= 55 or CRITICAL)
  if (baseScore >= 55 || baseCategory === "CRITICAL") {
    const baseAction = baseCategory === "CRITICAL" ? "reply" : "read_later";

    // Run deep reasoning + swarm analysis in parallel
    const [deepResult, swarmResult] = await Promise.allSettled([
      deepReason({
        subject: email.subject,
        from: email.from,
        fromEmail: email.fromEmail,
        snippet: email.snippet,
        body: email.body || "",
        labels: email.labels,
        baseCategory,
        baseScore,
        senderImportance: senderScore,
      }),
      runSwarmAnalysis(
        {
          subject: email.subject,
          from: email.from,
          fromEmail: email.fromEmail,
          snippet: email.snippet,
          body: email.body || "",
        },
        baseScore,
        baseCategory,
        baseAction
      ),
    ]);

    const result = deepResult.status === "fulfilled" ? deepResult.value : {
      category: baseCategory,
      priorityScore: baseScore,
      urgency: baseUrgency,
      recommendedAction: baseAction,
      confidence: 0.6,
      reason: "Rule-based fallback",
      summary: email.snippet,
      keyPoints: [],
      modelSource: "local:rules",
    };

    const swarm = swarmResult.status === "fulfilled" ? swarmResult.value : null;

    return { ...result, swarm };
  }

  // Low priority — rule-based result only (no LLM cost)
  const actionMap: Record<string, string> = {
    CRITICAL: "reply",
    PRIMARY: baseScore >= 40 ? "reply" : "read_later",
    TRANSACTIONS: "track",
    PROMOTIONS: "archive",
    SOCIAL: "read_later",
    LOW_PRIORITY: "archive",
  };

  return {
    category: baseCategory,
    priorityScore: baseScore,
    urgency: baseUrgency,
    recommendedAction: actionMap[baseCategory] || "read_later",
    confidence: 0.75,
    reason: `Rule-based: ${baseCategory.toLowerCase()} email, sender score ${senderScore.toFixed(2)}`,
    summary: email.snippet,
    keyPoints: [],
    modelSource: "local",
    swarm: null,
  };
}

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
router.post("/decisions", async (req, res) => {
  try {
    const body = CreateDecisionBody.parse(req.body);
    const { emailId, forceRefresh } = body;

    const emailRows = await db
      .select()
      .from(emailsTable)
      .where(eq(emailsTable.id, emailId))
      .limit(1);

    if (emailRows.length === 0) {
      res.status(404).json({ error: "not_found", message: "Email not found" });
      return;
    }

    const email = emailRows[0];

    if (!forceRefresh) {
      const existing = await db
        .select()
        .from(aiDecisionsTable)
        .where(eq(aiDecisionsTable.emailId, emailId))
        .limit(1);

      if (existing.length > 0) {
        const d = existing[0];
        res.json({
          ...d,
          keyPoints: (d.keyPoints as string[]) || [],
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        });
        return;
      }
    }

    const pipelineResult = await runDecisionPipeline({
      id: email.id,
      subject: email.subject,
      from: email.from,
      fromEmail: email.fromEmail,
      snippet: email.snippet,
      body: email.body || "",
      labels: (email.labels as string[]) || [],
      receivedAt: email.receivedAt,
    });

    const { swarm, ...result } = pipelineResult;

    const decisionId = randomUUID();
    const now = new Date();

    await db.delete(aiDecisionsTable).where(eq(aiDecisionsTable.emailId, emailId));

    await db.insert(aiDecisionsTable).values({
      id: decisionId,
      emailId,
      ...result,
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(emailsTable)
      .set({
        category: result.category,
        priorityScore: result.priorityScore,
        urgency: result.urgency,
        updatedAt: now,
      })
      .where(eq(emailsTable.id, emailId));

    if (process.env["ENABLE_TASK_SYSTEM"] === "true") {
      createTaskForEmail(emailId).catch((e) => console.error("[tasks] createTask error:", e));
    }

    res.json({
      id: decisionId,
      emailId,
      ...result,
      swarm: swarm ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof QueueFullError) {
      res.status(503).json({ error: "queue_full", message: (err as Error).message });
      return;
    }
    req.log.error({ err }, "Failed to create decision");
    res.status(500).json({ error: "internal_error", message: "Failed to create decision" });
  }
});

router.get("/decisions/:emailId", async (req, res) => {
  try {
    const { emailId } = req.params;

    const rows = await db
      .select()
      .from(aiDecisionsTable)
      .where(eq(aiDecisionsTable.emailId, emailId))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: "not_found", message: "Decision not found" });
      return;
    }

    const d = rows[0];
    res.json({
      ...d,
      keyPoints: (d.keyPoints as string[]) || [],
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get decision");
    res.status(500).json({ error: "internal_error", message: "Failed to get decision" });
  }
});

// ── POST /api/decisions/batch ─────────────────────
// Score all emails that don't have a decision yet (runs in background)
router.post("/decisions/batch", async (req, res) => {
  try {
    const allEmails = await db.select().from(emailsTable);
    const existingDecisions = await db.select({ emailId: aiDecisionsTable.emailId }).from(aiDecisionsTable);
    const scoredIds = new Set(existingDecisions.map((d) => d.emailId));
    const toScore = allEmails.filter((e) => !scoredIds.has(e.id));

    res.json({ queued: toScore.length, message: `Scoring ${toScore.length} emails in background` });

    // Run in background
    setImmediate(async () => {
      for (const email of toScore) {
        try {
          const pipelineResult = await runDecisionPipeline({
            id: email.id,
            subject: email.subject,
            from: email.from,
            fromEmail: email.fromEmail,
            snippet: email.snippet,
            body: email.body || "",
            labels: (email.labels as string[]) || [],
            receivedAt: email.receivedAt,
          });
          const { swarm: _swarm, ...result } = pipelineResult;
          const now = new Date();
          await db.insert(aiDecisionsTable).values({
            id: randomUUID(),
            emailId: email.id,
            ...result,
            createdAt: now,
            updatedAt: now,
          }).onConflictDoNothing();
          await db.update(emailsTable).set({
            category: result.category,
            priorityScore: result.priorityScore,
            urgency: result.urgency,
            updatedAt: now,
          }).where(eq(emailsTable.id, email.id));
        } catch (e) {
          console.error("Batch score failed for", email.id, e);
        }
      }
    });
  } catch (err) {
    req.log.error({ err }, "Failed to batch score");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

// ── Exported helper for use by sync route ────────
export async function batchScoreUnscored(): Promise<number> {
  const allEmails = await db.select().from(emailsTable);
  const existing = await db.select({ emailId: aiDecisionsTable.emailId }).from(aiDecisionsTable);
  const scoredIds = new Set(existing.map((d) => d.emailId));
  const toScore = allEmails.filter((e) => !scoredIds.has(e.id));

  let scored = 0;
  for (const email of toScore) {
    try {
      const pipelineResult = await runDecisionPipeline({
        id: email.id,
        subject: email.subject,
        from: email.from,
        fromEmail: email.fromEmail,
        snippet: email.snippet,
        body: email.body || "",
        labels: (email.labels as string[]) || [],
        receivedAt: email.receivedAt,
      });
      const { swarm: _swarm2, ...result } = pipelineResult;
      const now = new Date();
      await db.insert(aiDecisionsTable).values({ id: randomUUID(), emailId: email.id, ...result, createdAt: now, updatedAt: now }).onConflictDoNothing();
      await db.update(emailsTable).set({ category: result.category, priorityScore: result.priorityScore, urgency: result.urgency, updatedAt: now }).where(eq(emailsTable.id, email.id));
      if (process.env["ENABLE_TASK_SYSTEM"] === "true") {
        createTaskForEmail(email.id).catch((e) => console.error("[tasks] batch createTask error:", e));
      }
      scored++;
    } catch (e) {
      console.error("Batch score failed for", email.id, e);
    }
  }
  return scored;
}
