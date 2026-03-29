/**
 * BullMQ GPU Worker
 * ─────────────────────────────────────────────────────────────────
 * Queues handled:
 *   local-ai-queue  — classification, summarization, embeddings (local LLM / GPU)
 *   cloud-ai-queue  — deep reasoning, reply generation (OpenAI)
 *   embedding-jobs  — generate + store pgvector embeddings
 *   process-email   — full pipeline per email (runs stages 1-3)
 * ─────────────────────────────────────────────────────────────────
 */

import { Worker, Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import OpenAI from "openai";

// ── Config ────────────────────────────────────────────────────────
const REDIS_URL     = process.env.REDIS_URL || "redis://localhost:6379";
const OLLAMA        = process.env.OLLAMA_ENDPOINT || "http://localhost:11434";
const VLLM          = process.env.VLLM_ENDPOINT || null;
const VLLM_MODEL    = process.env.VLLM_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
const LOCAL_CONC    = parseInt(process.env.WORKER_CONCURRENCY_LOCAL || "4", 10);
const CLOUD_CONC    = parseInt(process.env.WORKER_CONCURRENCY_CLOUD || "8", 10);
const GPU_AVAILABLE = process.env.GPU_AVAILABLE === "true";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "placeholder" });

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ── Local LLM caller (vLLM → Ollama → error) ─────────────────────
async function callLocal(prompt, { timeoutMs = 20_000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);

  // vLLM preferred (OpenAI-compatible)
  if (VLLM) {
    const r = await fetch(`${VLLM}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 512,
      }),
      signal,
    });
    if (!r.ok) throw new Error(`vllm_error:${r.status}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "";
  }

  // Ollama fallback
  const r = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral", prompt, stream: false }),
    signal,
  });
  if (!r.ok) throw new Error(`ollama_error:${r.status}`);
  const d = await r.json();
  return d.response || "";
}

// ── Cloud LLM caller ──────────────────────────────────────────────
async function callCloud(systemPrompt, userMessage, { json = true } = {}) {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: json ? { type: "json_object" } : undefined,
    temperature: 0.1,
    max_tokens: 512,
  });
  return resp.choices[0]?.message?.content || "{}";
}

// ── JSON safe parse ───────────────────────────────────────────────
function safeJson(text, fallback = {}) {
  try { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return fallback; }
}

// ── Classify prompt ───────────────────────────────────────────────
const CLASSIFY_SYS = `You are an email classifier. Return ONLY valid JSON:
{"category":"action_required|payment|security|updates|promotions|social|spam","priority_score":0-100,"reason":"one sentence","action":"reply|pay|review|read|archive|delete|none","confidence":0.0-1.0}`;

// ── Worker: local-ai-queue ────────────────────────────────────────
const localWorker = new Worker(
  "local-ai-queue",
  async (job) => {
    const { type, email, baseScore } = job.data;
    const t0 = Date.now();

    let raw = "";
    let modelUsed = "local:unknown";

    try {
      const prompt = `${CLASSIFY_SYS}\n\nFrom: ${email.from} <${email.fromEmail}>\nSubject: ${email.subject}\nPreview: ${email.snippet}`;

      if (GPU_AVAILABLE || VLLM) {
        raw = await callLocal(prompt);
        modelUsed = VLLM ? `local:vllm:${VLLM_MODEL}` : "local:ollama";
      } else {
        // Trigger cloud fallback via cloud queue
        return { redirect: "cloud-ai-queue", type, email, baseScore };
      }
    } catch (err) {
      console.warn(`[local-worker] Local failed (${err.message}), falling back to cloud`);
      raw = await callCloud(CLASSIFY_SYS, `From: ${email.from} <${email.fromEmail}>\nSubject: ${email.subject}\nPreview: ${email.snippet}`);
      modelUsed = "cloud:fallback";
    }

    const parsed = safeJson(raw, {});
    return {
      category: parsed.category || "updates",
      priority_score: Math.min(100, Math.max(0, parsed.priority_score || baseScore || 30)),
      reason: parsed.reason || "Local AI classified",
      action: parsed.action || "read",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.6)),
      model_used: modelUsed,
      latency_ms: Date.now() - t0,
    };
  },
  {
    connection,
    concurrency: LOCAL_CONC,
    limiter: { max: 10, duration: 1000 },
  }
);

// ── Worker: cloud-ai-queue ────────────────────────────────────────
const cloudWorker = new Worker(
  "cloud-ai-queue",
  async (job) => {
    const { type, email, baseScore } = job.data;
    const t0 = Date.now();

    const DEEP_SYS = `You are an elite AI email analysis engine. Deeply analyze this email.
Rules: CRITICAL (OTP/security/payment failure)→priority 90-100; human/interview/deadline→reply; receipts→track; marketing→archive.
Return ONLY valid JSON:
{"category":"PRIMARY|CRITICAL|TRANSACTIONS|PROMOTIONS|SOCIAL|LOW_PRIORITY","priority_score":0-100,"urgency":"critical|high|medium|low","recommended_action":"reply|ignore|archive|track|read_later","confidence":0.0-1.0,"reason":"max 15 words","summary":"2-3 sentences","key_points":["point1","point2"]}`;

    const userMsg = `Pre-score: ${baseScore}/100\nFrom: ${email.from} <${email.fromEmail}>\nSubject: ${email.subject}\n\n${email.body || email.snippet}`;

    let raw = "{}";
    let modelUsed = "cloud:gpt-4o-mini";

    try {
      raw = await callCloud(DEEP_SYS, userMsg);
    } catch (cloudErr) {
      console.warn(`[cloud-worker] Cloud failed: ${cloudErr.message}`);
      // Last-resort: local
      try {
        raw = await callLocal(`${DEEP_SYS}\n\n${userMsg}`, { timeoutMs: 30_000 });
        modelUsed = "local:emergency-fallback";
      } catch {
        /* return defaults */
      }
    }

    const parsed = safeJson(raw, {});
    return {
      category: parsed.category || "updates",
      priority_score: Math.min(100, Math.max(0, parsed.priority_score || baseScore || 30)),
      urgency: parsed.urgency || "medium",
      recommended_action: parsed.recommended_action || "read_later",
      reason: parsed.reason || "Cloud AI classified",
      summary: parsed.summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
      model_used: modelUsed,
      latency_ms: Date.now() - t0,
    };
  },
  {
    connection,
    concurrency: CLOUD_CONC,
    limiter: { max: 20, duration: 1000 },
  }
);

// ── Worker: embedding-jobs ────────────────────────────────────────
const embeddingWorker = new Worker(
  "embedding-jobs",
  async (job) => {
    const { text, emailId } = job.data;
    const t0 = Date.now();

    // Use local vLLM embeddings if available, else OpenAI
    if (VLLM) {
      const r = await fetch(`${VLLM}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: VLLM_MODEL, input: text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const d = await r.json();
        return { emailId, embedding: d.data?.[0]?.embedding, model: "local", latency_ms: Date.now() - t0 };
      }
    }

    // OpenAI embeddings fallback
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return {
      emailId,
      embedding: resp.data[0].embedding,
      model: "text-embedding-3-small",
      latency_ms: Date.now() - t0,
    };
  },
  { connection, concurrency: 6 }
);

// ── Event logging ─────────────────────────────────────────────────
for (const [worker, name] of [
  [localWorker, "local-ai"],
  [cloudWorker, "cloud-ai"],
  [embeddingWorker, "embedding"],
]) {
  worker.on("completed", (job, result) => {
    console.log(`[${name}] ✓ job:${job.id} model:${result?.model_used || "?"} ${result?.latency_ms || 0}ms`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${name}] ✗ job:${job?.id} error:${err.message}`);
  });
  worker.on("error", (err) => {
    console.error(`[${name}] worker error:`, err.message);
  });
}

// ── Shutdown ──────────────────────────────────────────────────────
async function shutdown(sig) {
  console.log(`[worker] Received ${sig}, draining queues...`);
  await Promise.all([
    localWorker.close(),
    cloudWorker.close(),
    embeddingWorker.close(),
  ]);
  console.log("[worker] Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

const gpuLabel = GPU_AVAILABLE ? "GPU" : (VLLM ? "vLLM" : "CPU");
console.log(`[worker] Started — ${gpuLabel} | local:${LOCAL_CONC} cloud:${CLOUD_CONC}`);
