import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GpuStatus {
  available: boolean;
  name?: string;
  memoryFree?: number;
  memoryTotal?: number;
  utilization?: number;
}

export interface LocalLlmStatus {
  available: boolean;
  models: string[];
  endpoint: string;
}

let gpuCache: { status: GpuStatus; ts: number } | null = null;
let llmCache: { status: LocalLlmStatus; ts: number } | null = null;
const CACHE_TTL = 30_000;

export async function detectGpu(): Promise<GpuStatus> {
  if (gpuCache && Date.now() - gpuCache.ts < CACHE_TTL) return gpuCache.status;

  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.free,memory.total,utilization.gpu --format=csv,noheader,nounits",
      { timeout: 3000 }
    );
    const parts = stdout.trim().split(", ");
    const status: GpuStatus = {
      available: true,
      name: parts[0],
      memoryFree: parseInt(parts[1]) || undefined,
      memoryTotal: parseInt(parts[2]) || undefined,
      utilization: parseInt(parts[3]) || undefined,
    };
    gpuCache = { status, ts: Date.now() };
    return status;
  } catch {
    const status: GpuStatus = { available: false };
    gpuCache = { status, ts: Date.now() };
    return status;
  }
}

export async function detectLocalLlm(): Promise<LocalLlmStatus> {
  if (llmCache && Date.now() - llmCache.ts < CACHE_TTL) return llmCache.status;

  const endpoint = process.env.OLLAMA_ENDPOINT || "http://localhost:11434";

  try {
    const resp = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) throw new Error("not ok");
    const data = (await resp.json()) as { models?: { name: string }[] };
    const models = (data.models || []).map((m) => m.name);
    const status: LocalLlmStatus = { available: true, models, endpoint };
    llmCache = { status, ts: Date.now() };
    return status;
  } catch {
    const status: LocalLlmStatus = { available: false, models: [], endpoint };
    llmCache = { status, ts: Date.now() };
    return status;
  }
}

export function invalidateCache() {
  gpuCache = null;
  llmCache = null;
}
