import { detectLocalLlm } from "./gpu.js";
import { db, modelProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getCircuitBreaker } from "./circuit-breaker.js";

export interface LlmResponse {
  text: string;
  model: string;
  durationMs: number;
}

const RTX3080_VRAM_MB = 10_000;

const DEFAULT_VRAM_BY_SIZE: Record<string, number> = {
  "3b": 2500,
  "7b": 5000,
  "8b": 5500,
  "13b": 8500,
  "70b": 40000,
};

function estimateVramMb(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const [size, vram] of Object.entries(DEFAULT_VRAM_BY_SIZE)) {
    if (lower.includes(size)) return vram;
  }
  return 5000;
}

function qualityScoreForModel(modelName: string): number {
  const lower = modelName.toLowerCase();
  if (lower.includes("70b")) return 0.92;
  if (lower.includes("13b")) return 0.85;
  if (lower.includes("8b") || lower.includes("7b")) return 0.78;
  if (lower.includes("3b") || lower.includes("mini")) return 0.65;
  return 0.70;
}

async function getModelProfileFromDb(modelId: string) {
  try {
    const rows = await db
      .select()
      .from(modelProfilesTable)
      .where(eq(modelProfilesTable.modelId, modelId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function upsertDiscoveredModel(modelName: string): Promise<void> {
  try {
    const existing = await getModelProfileFromDb(modelName);
    if (existing) return;

    const vram = estimateVramMb(modelName);
    const quality = qualityScoreForModel(modelName);
    const now = new Date();

    await db.insert(modelProfilesTable).values({
      id: randomUUID(),
      modelId: modelName,
      tier: "local",
      strengths: ["local inference", "privacy", "no API cost"],
      weaknesses: ["requires local GPU", "context may be limited"],
      bestUseCases: ["classify-email", "summarize-email"],
      avgLatencyMs: 4000,
      qualityScore: quality,
      vramRequiredMb: vram,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[local-llm] Auto-registered discovered model: ${modelName} (${vram}MB VRAM est.)`);
  } catch {
    // best-effort — ignore failures
  }
}

async function getBestModelByQuality(models: string[]): Promise<string | null> {
  if (models.length === 0) return null;

  try {
    const profiles = await Promise.all(
      models.map((m) => getModelProfileFromDb(m))
    );

    let bestModel = models[0];
    let bestScore = -1;

    for (let i = 0; i < models.length; i++) {
      const profile = profiles[i];
      const score = profile?.qualityScore ?? qualityScoreForModel(models[i]);
      if (score > bestScore) {
        bestScore = score;
        bestModel = models[i];
      }
    }

    return bestModel;
  } catch {
    return models[0];
  }
}

export async function discoverAndRegisterModels(): Promise<string[]> {
  const llm = await detectLocalLlm();
  if (!llm.available || llm.models.length === 0) return [];

  await Promise.allSettled(llm.models.map(upsertDiscoveredModel));
  return llm.models;
}

export async function callLocalLlm(
  prompt: string,
  opts: { timeoutMs?: number; model?: string; systemPrompt?: string } = {}
): Promise<LlmResponse> {
  const { timeoutMs = 15_000, model: forcedModel, systemPrompt } = opts;

  const llm = await detectLocalLlm();
  if (!llm.available) throw new Error("local_llm_unavailable");

  const breaker = getCircuitBreaker("local:ollama", {
    tripThresholdMs: 8_000,
    recoveryWindowMs: 30_000,
  });

  if (breaker.isOpen()) {
    throw new Error("circuit_open:local:ollama");
  }

  let model: string | null;
  if (forcedModel) {
    model = forcedModel;
  } else {
    model = await getBestModelByQuality(llm.models);
  }

  if (!model) throw new Error("no_model_available");

  const numGpuLayers = parseInt(process.env["OLLAMA_NUM_GPU_LAYERS"] ?? "35");

  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    options: {
      num_gpu: numGpuLayers,
    },
  };

  if (systemPrompt) {
    body["system"] = systemPrompt;
  }

  const t0 = Date.now();

  const result = await breaker.call(async () => {
    const resp = await fetch(`${llm.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`ollama_error: ${err}`);
    }

    const data = (await resp.json()) as { response?: string };
    const text = (data.response || "").trim();
    return text;
  });

  return { text: result, model, durationMs: Date.now() - t0 };
}

export async function callLocalLlmBatch(
  prompts: string[],
  opts: { timeoutMs?: number; model?: string; systemPrompt?: string } = {}
): Promise<LlmResponse[]> {
  return Promise.all(prompts.map((p) => callLocalLlm(p, opts)));
}
