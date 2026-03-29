import { routeTask, type TaskType } from "./router.js";
import { callLocalLlm } from "./local-llm.js";
import { callBestCloudProvider } from "./cloud-providers.js";
import { localAiQueue, cloudAiQueue } from "./queue.js";
import { db, outcomeSignalsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export interface AiOutput {
  category: string;
  priority_score: number;
  reason: string;
  action: string;
  confidence: number;
  model_used: "local" | "cloud";
}

const responseCache = new Map<string, { result: AiOutput; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function cacheKey(emailId: string, task: TaskType): string {
  return `${task}:${emailId}`;
}

function fromCache(key: string): AiOutput | null {
  const entry = responseCache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL) return null;
  return entry.result;
}

function toCache(key: string, result: AiOutput) {
  responseCache.set(key, { result, ts: Date.now() });
  if (responseCache.size > 1000) {
    const first = responseCache.keys().next().value;
    if (first) responseCache.delete(first);
  }
}

export function getCacheStats() {
  return { size: responseCache.size, maxSize: 1000 };
}

export interface EmailPayload {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
  labels: string[];
  receivedAt: Date | null;
}

function buildClassifyPrompt(email: EmailPayload): string {
  return `You are an adaptive intelligence engine — not a classifier. Every piece of communication that arrives is an intent signal: a request, a trigger, a decision waiting to happen, an opportunity to act or ignore.

Your job is to detect what this communication is really asking, determine its urgency and stakes, and output a decision with a clear action directive.

Signal received:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Preview: ${email.snippet}

Process this signal through your decision engine:
- What is the sender's actual intent? (not just what they said)
- What does ignoring this cost? What does acting on it gain?
- What is the correct action, and how urgent is it?

Respond ONLY with valid JSON in this exact format:
{
  "category": "action_required|payment|security|updates|promotions|social|spam",
  "priority_score": <integer 0-100, reflecting real-world impact of acting vs. ignoring>,
  "reason": "<one sentence: the true intent and why this score>",
  "action": "reply|pay|review|read|archive|delete|none",
  "confidence": <float 0.0-1.0>
}`;
}

function buildDeepReasonPrompt(email: EmailPayload): string {
  return `You are an adaptive intelligence and decision engine. This signal has been escalated for deep analysis — it carries enough weight to warrant your full reasoning capacity.

Your role: think like the person receiving this, understand what is truly at stake, detect hidden urgency or opportunity, and output the optimal decision with clear justification.

Signal:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Body: ${email.body || email.snippet}

Deep reasoning protocol:
1. INTENT — What is the sender explicitly asking, and what do they actually want?
2. STAKES — What happens if this is ignored for 24h? 72h? A week?
3. OPPORTUNITY — Is there an upside to acting quickly beyond just responding?
4. DECISION — Given all signals, what is the single best action?

Return ONLY valid JSON:
{
  "category": "action_required|payment|security|updates|promotions|social|spam",
  "priority_score": <integer 0-100, weighted by real-world consequence>,
  "reason": "<1-2 sentences: the core intent, stakes, and why this score>",
  "action": "reply|pay|review|read|archive|delete|none",
  "confidence": <float 0.0-1.0>
}`;
}

async function callCloud(prompt: string): Promise<string> {
  try {
    const resp = await callBestCloudProvider(prompt);
    return resp.text;
  } catch {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 256,
    });
    return resp.choices[0]?.message?.content || "{}";
  }
}

function parseAiJson(raw: string, modelUsed: "local" | "cloud"): AiOutput {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      category: parsed.category || "updates",
      priority_score: Math.min(100, Math.max(0, Number(parsed.priority_score) || 30)),
      reason: parsed.reason || "AI classified",
      action: parsed.action || "read",
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      model_used: modelUsed,
    };
  } catch {
    return {
      category: "updates",
      priority_score: 30,
      reason: "Parse error — defaulted",
      action: "read",
      confidence: 0.3,
      model_used: modelUsed,
    };
  }
}

async function getStrategySuccessRate(strategy: string): Promise<number> {
  if (!strategy || process.env["ENABLE_OUTCOME_ENGINE"] !== "true") return 1.0;
  try {
    const rows = await db
      .select({
        outcomeType: outcomeSignalsTable.outcomeType,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(outcomeSignalsTable)
      .where(eq(outcomeSignalsTable.strategy, strategy))
      .groupBy(outcomeSignalsTable.outcomeType);

    if (rows.length === 0) return 1.0;

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    const positive = rows
      .filter((r) => r.outcomeType === "response_received" || r.outcomeType === "positive")
      .reduce((sum, r) => sum + r.count, 0);
    const negative = rows
      .filter((r) => r.outcomeType === "ignored" || r.outcomeType === "negative" || r.outcomeType === "escalated")
      .reduce((sum, r) => sum + r.count, 0);

    const successRate = positive / total;
    const failureRate = negative / total;

    return Math.max(0.6, Math.min(1.4, 1.0 + successRate * 0.4 - failureRate * 0.3));
  } catch {
    return 1.0;
  }
}

export async function runAI(
  task: TaskType,
  email: EmailPayload,
  priorityScore: number
): Promise<AiOutput> {
  const key = cacheKey(email.id, task);
  const cached = fromCache(key);
  if (cached) return cached;

  const routing = await routeTask(task, priorityScore);

  const execute = async (): Promise<AiOutput> => {
    if (routing.tier === "local") {
      try {
        const prompt =
          task === "deep-reasoning"
            ? buildDeepReasonPrompt(email)
            : buildClassifyPrompt(email);

        const response = await callLocalLlm(prompt, { timeoutMs: 12_000 });
        const result = parseAiJson(response.text, "local");
        const strategyRate = await getStrategySuccessRate(result.action);
        result.priority_score = Math.round(
          Math.min(100, result.priority_score * strategyRate)
        );
        return result;
      } catch (err) {
        if (!routing.fallbackAllowed) throw err;
        const prompt =
          task === "deep-reasoning"
            ? buildDeepReasonPrompt(email)
            : buildClassifyPrompt(email);
        const raw = await callCloud(prompt);
        const result = parseAiJson(raw, "cloud");
        const strategyRate = await getStrategySuccessRate(result.action);
        result.priority_score = Math.round(
          Math.min(100, result.priority_score * strategyRate)
        );
        return result;
      }
    } else {
      const prompt =
        task === "deep-reasoning"
          ? buildDeepReasonPrompt(email)
          : buildClassifyPrompt(email);
      const raw = await callCloud(prompt);
      const result = parseAiJson(raw, "cloud");
      const strategyRate = await getStrategySuccessRate(result.action);
      result.priority_score = Math.round(
        Math.min(100, result.priority_score * strategyRate)
      );
      return result;
    }
  };

  const queue = routing.tier === "local" ? localAiQueue : cloudAiQueue;
  const priority = priorityScore;

  return new Promise<AiOutput>((resolve, reject) => {
    if ((queue as any)._handlerRegistered !== true) {
      queue.process(async (job) => {
        return (job.data as { execute: () => Promise<AiOutput> }).execute();
      });
      (queue as any)._handlerRegistered = true;
    }

    queue
      .add(task, { execute }, priority)
      .then((job) => {
        const checkDone = setInterval(() => {
          if (job.status === "completed" && job.result) {
            clearInterval(checkDone);
            const result = job.result as AiOutput;
            toCache(key, result);
            resolve(result);
          } else if (job.status === "failed") {
            clearInterval(checkDone);
            reject(new Error(job.error || "job_failed"));
          }
        }, 50);

        setTimeout(() => {
          clearInterval(checkDone);
          reject(new Error("job_timeout"));
        }, 30_000);
      })
      .catch(reject);
  });
}

export async function runAIBatch(
  task: TaskType,
  emails: EmailPayload[],
  getScore: (e: EmailPayload) => number
): Promise<Map<string, AiOutput>> {
  const results = await Promise.allSettled(
    emails.map((e) => runAI(task, e, getScore(e)))
  );

  const output = new Map<string, AiOutput>();
  for (let i = 0; i < emails.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      output.set(emails[i].id, r.value);
    }
  }
  return output;
}
