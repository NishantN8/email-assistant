import { detectGpu, detectLocalLlm } from "./gpu.js";

export type TaskType =
  | "classify-email"
  | "summarize-email"
  | "generate-embedding"
  | "deep-reasoning"
  | "reply-generation";

export type ModelTier = "local" | "cloud";

export interface RoutingDecision {
  tier: ModelTier;
  reason: string;
  fallbackAllowed: boolean;
}

// Baseline routing table: task → preferred tier
const TASK_TIER: Record<TaskType, ModelTier> = {
  "classify-email": "local",
  "summarize-email": "local",
  "generate-embedding": "local",
  "deep-reasoning": "cloud",
  "reply-generation": "cloud",
};

// Score threshold above which we always escalate to cloud
const CLOUD_ESCALATION_SCORE = 65;

export async function routeTask(
  task: TaskType,
  priorityScore: number,
  opts: { forceCloud?: boolean; forcedLoad?: number } = {}
): Promise<RoutingDecision> {
  const { forceCloud = false } = opts;

  if (forceCloud) {
    return { tier: "cloud", reason: "forced_cloud", fallbackAllowed: false };
  }

  // High-priority emails always get cloud for tasks that can benefit from it
  if (priorityScore >= CLOUD_ESCALATION_SCORE && task !== "generate-embedding") {
    return {
      tier: "cloud",
      reason: `priority_score_${priorityScore}_exceeds_threshold`,
      fallbackAllowed: false,
    };
  }

  const preferred = TASK_TIER[task];
  if (preferred === "cloud") {
    return { tier: "cloud", reason: `task_${task}_requires_cloud`, fallbackAllowed: false };
  }

  // Check if local LLM is actually available
  const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);

  if (!llm.available) {
    return {
      tier: "cloud",
      reason: gpu.available ? "local_llm_not_running" : "no_gpu_or_local_llm",
      fallbackAllowed: false,
    };
  }

  // GPU available but under heavy load (>90% utilization) → cloud
  if (gpu.available && (gpu.utilization ?? 0) > 90) {
    return { tier: "cloud", reason: "gpu_overloaded", fallbackAllowed: true };
  }

  // GPU available with low free memory → cloud
  if (gpu.available && gpu.memoryFree !== undefined && gpu.memoryTotal !== undefined) {
    const freeRatio = gpu.memoryFree / gpu.memoryTotal;
    if (freeRatio < 0.15) {
      return { tier: "cloud", reason: "gpu_low_memory", fallbackAllowed: true };
    }
  }

  return { tier: "local", reason: "local_available", fallbackAllowed: true };
}
