import { routeTask, type TaskType } from "./router.js";
import { callLocalLlm } from "./local-llm.js";
import { localAiQueue, cloudAiQueue } from "./queue.js";
import { openai } from "@workspace/integrations-openai-ai-server";

// ── Output format (matches spec) ─────────────────
export interface AiOutput {
  category: string;
  priority_score: number;
  reason: string;
  action: string;
  confidence: number;
  model_used: "local" | "cloud";
}

// ── In-memory response cache ──────────────────────
const responseCache = new Map<string, { result: AiOutput; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
  // Evict oldest if too large
  if (responseCache.size > 1000) {
    const first = responseCache.keys().next().value;
    if (first) responseCache.delete(first);
  }
}

export function getCacheStats() {
  return { size: responseCache.size, maxSize: 1000 };
}

// ── Email payload ─────────────────────────────────
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

// ── Prompt builder ────────────────────────────────
function buildClassifyPrompt(email: EmailPayload): string {
  return `You are an AI email classifier. Analyze this email and return JSON only.

Email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Preview: ${email.snippet}

Respond ONLY with valid JSON in this exact format:
{
  "category": "action_required|payment|security|updates|promotions|social|spam",
  "priority_score": <integer 0-100>,
  "reason": "<one sentence why>",
  "action": "reply|pay|review|read|archive|delete|none",
  "confidence": <float 0.0-1.0>
}`;
}

function buildDeepReasonPrompt(email: EmailPayload): string {
  return `You are a senior executive assistant AI. Deeply analyze this email.

From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Body: ${email.body || email.snippet}

This email was flagged as potentially high-priority. Return ONLY valid JSON:
{
  "category": "action_required|payment|security|updates|promotions|social|spam",
  "priority_score": <integer 0-100>,
  "reason": "<detailed reason, 1-2 sentences>",
  "action": "reply|pay|review|read|archive|delete|none",
  "confidence": <float 0.0-1.0>
}`;
}

// ── Cloud LLM call ────────────────────────────────
async function callCloud(prompt: string): Promise<string> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 256,
  });
  return resp.choices[0]?.message?.content || "{}";
}

// ── JSON parser with fallback ─────────────────────
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

// ── Core runAI function ───────────────────────────
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
        return parseAiJson(response.text, "local");
      } catch (err) {
        if (!routing.fallbackAllowed) throw err;
        // Fall through to cloud
        const prompt =
          task === "deep-reasoning"
            ? buildDeepReasonPrompt(email)
            : buildClassifyPrompt(email);
        const raw = await callCloud(prompt);
        return parseAiJson(raw, "cloud");
      }
    } else {
      const prompt =
        task === "deep-reasoning"
          ? buildDeepReasonPrompt(email)
          : buildClassifyPrompt(email);
      const raw = await callCloud(prompt);
      return parseAiJson(raw, "cloud");
    }
  };

  // Route to appropriate queue
  const queue = routing.tier === "local" ? localAiQueue : cloudAiQueue;
  const priority = priorityScore;

  return new Promise<AiOutput>((resolve, reject) => {
    // Register handler only once
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

        // Timeout after 30s
        setTimeout(() => {
          clearInterval(checkDone);
          reject(new Error("job_timeout"));
        }, 30_000);
      })
      .catch(reject);
  });
}

// ── Batch runAI for multiple emails ───────────────
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
