import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, emailsTable, aiDecisionsTable, senderMemoryTable } from "@workspace/db";
import { CreateDecisionBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

async function generateAiDecision(emailData: {
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
  labels: string[];
  senderImportance: number;
}) {
  const systemPrompt = `You are an AI email intelligence engine. Analyze emails and produce structured decisions.

For each email, output ONLY valid JSON with this exact structure:
{
  "category": "PRIMARY" | "CRITICAL" | "TRANSACTIONS" | "PROMOTIONS" | "SOCIAL" | "LOW_PRIORITY",
  "priority_score": 0-100,
  "urgency": "critical" | "high" | "medium" | "low",
  "recommended_action": "reply" | "ignore" | "archive" | "track" | "read_later",
  "confidence": 0.0-1.0,
  "reason": "concise explanation max 15 words",
  "summary": "2-3 sentence email summary",
  "key_points": ["point1", "point2", "point3"]
}

Decision rules (apply in order):
1. CRITICAL: OTP codes, security alerts, payment failures, account compromised → priority 90-100
2. Human-written emails from known people → HIGH priority
3. Payment confirmations, receipts, orders → TRANSACTIONS category
4. Marketing, newsletters, promotions → PROMOTIONS, LOW priority
5. Adjust priority based on sender importance score (0-1): ${emailData.senderImportance}

Output ONLY the JSON object, no other text.`;

  const userMessage = `Subject: ${emailData.subject}
From: ${emailData.from} <${emailData.fromEmail}>
Labels: ${emailData.labels.join(", ")}

${emailData.body || emailData.snippet}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(text);
    return {
      category: parsed.category || "PRIMARY",
      priorityScore: Math.min(100, Math.max(0, parsed.priority_score || 50)),
      urgency: parsed.urgency || "medium",
      recommendedAction: parsed.recommended_action || "read_later",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reason: parsed.reason || "AI analysis complete",
      summary: parsed.summary || "",
      keyPoints: Array.isArray(parsed.key_points) ? parsed.key_points : [],
    };
  } catch {
    return {
      category: "PRIMARY",
      priorityScore: 50,
      urgency: "medium",
      recommendedAction: "read_later",
      confidence: 0.5,
      reason: "Unable to parse AI response",
      summary: "",
      keyPoints: [],
    };
  }
}

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

    const senderRows = await db
      .select()
      .from(senderMemoryTable)
      .where(eq(senderMemoryTable.fromEmail, email.fromEmail))
      .limit(1);

    const senderImportance = senderRows[0]?.importanceScore ?? 0.5;

    const aiResult = await generateAiDecision({
      subject: email.subject,
      from: email.from,
      fromEmail: email.fromEmail,
      snippet: email.snippet,
      body: email.body || "",
      labels: (email.labels as string[]) || [],
      senderImportance,
    });

    const decisionId = randomUUID();
    const now = new Date();

    await db
      .delete(aiDecisionsTable)
      .where(eq(aiDecisionsTable.emailId, emailId));

    await db.insert(aiDecisionsTable).values({
      id: decisionId,
      emailId,
      ...aiResult,
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(emailsTable)
      .set({
        category: aiResult.category,
        priorityScore: aiResult.priorityScore,
        urgency: aiResult.urgency,
        updatedAt: now,
      })
      .where(eq(emailsTable.id, emailId));

    res.json({
      id: decisionId,
      emailId,
      ...aiResult,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  } catch (err) {
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

export default router;
