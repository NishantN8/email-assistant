import { detectGpu, detectLocalLlm } from "./gpu.js";
import { db, modelProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export interface AdvancedRoutingParams {
  intent?: string;
  outcome_goal?: string;
  urgency?: "low" | "medium" | "high" | "critical";
  gpu_load?: number;
}

const TASK_TIER: Record<TaskType, ModelTier> = {
  "classify-email": "local",
  "summarize-email": "local",
  "generate-embedding": "local",
  "deep-reasoning": "cloud",
  "reply-generation": "cloud",
};

const CLOUD_ESCALATION_SCORE = 65;

const GPU_OVERLOAD_THRESHOLD = 90;
const GPU_MEMORY_FREE_RATIO_MIN = 0.15;

const ADVANCED_ROUTING_ENABLED = process.env["ENABLE_ADVANCED_ROUTING"] === "true";

async function getModelProfile(modelId: string) {
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

async function getBestLocalProfileId(): Promise<string> {
  try {
    const rows = await db
      .select()
      .from(modelProfilesTable)
      .where(eq(modelProfilesTable.tier, "local"));

    if (rows.length === 0) return "mistral-7b-local";

    const sorted = rows.sort(
      (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)
    );
    return sorted[0].modelId;
  } catch {
    return "mistral-7b-local";
  }
}

async function getBestCloudProfileId(): Promise<string> {
  const providers = ["groq", "gemini", "mistral", "openrouter", "gpt-4o-mini-cloud"];
  const envMap: Record<string, string> = {
    groq: "GROQ_API_KEY",
    gemini: "GOOGLE_AI_API_KEY",
    mistral: "MISTRAL_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  for (const provider of providers) {
    const envKey = envMap[provider];
    if (!envKey || process.env[envKey]) {
      return provider === "gpt-4o-mini-cloud" ? "gpt-4o-mini-cloud" : `${provider}-cloud`;
    }
  }
  return "gpt-4o-mini-cloud";
}

export async function routeTask(
  task: TaskType,
  priorityScore: number,
  opts: {
    forceCloud?: boolean;
    forcedLoad?: number;
    advanced?: AdvancedRoutingParams;
  } = {}
): Promise<RoutingDecision> {
  const { forceCloud = false, forcedLoad, advanced } = opts;

  if (forceCloud) {
    return { tier: "cloud", reason: "forced_cloud", fallbackAllowed: false };
  }

  if (priorityScore >= CLOUD_ESCALATION_SCORE && task !== "generate-embedding") {
    return {
      tier: "cloud",
      reason: `priority_score_${priorityScore}_exceeds_threshold`,
      fallbackAllowed: false,
    };
  }

  if (ADVANCED_ROUTING_ENABLED && advanced) {
    const { urgency, outcome_goal, gpu_load } = advanced;
    const effectiveGpuLoad = gpu_load ?? forcedLoad;

    if (urgency === "critical") {
      return { tier: "cloud", reason: "advanced_routing_critical_urgency", fallbackAllowed: false };
    }

    if (outcome_goal === "high_quality_reply" || outcome_goal === "deep_analysis") {
      const bestLocalId = await getBestLocalProfileId();
      const bestCloudId = await getBestCloudProfileId();
      const [localProfile, cloudProfile] = await Promise.all([
        getModelProfile(bestLocalId),
        getModelProfile(bestCloudId),
      ]);

      if (cloudProfile && localProfile) {
        const cloudBetter = cloudProfile.qualityScore > localProfile.qualityScore + 0.1;
        if (cloudBetter) {
          return {
            tier: "cloud",
            reason: `advanced_routing_quality_goal_${outcome_goal}`,
            fallbackAllowed: false,
          };
        }

        const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);
        const localBetter = localProfile.qualityScore > cloudProfile.qualityScore + 0.05;
        if (localBetter && llm.available) {
          const gpuLoadVal = effectiveGpuLoad ?? gpu.utilization ?? 0;
          if (!gpu.available || gpuLoadVal <= GPU_OVERLOAD_THRESHOLD) {
            return {
              tier: "local",
              reason: `advanced_routing_local_preferred_${outcome_goal}`,
              fallbackAllowed: true,
            };
          }
        }
      }
    }

    const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);
    const gpuLoadVal = effectiveGpuLoad ?? gpu.utilization ?? 0;

    if (gpu.available && gpuLoadVal > GPU_OVERLOAD_THRESHOLD) {
      return { tier: "cloud", reason: "advanced_routing_gpu_overloaded", fallbackAllowed: true };
    }

    if (gpu.available && gpu.memoryFree !== undefined && gpu.memoryTotal !== undefined) {
      const bestLocalId = await getBestLocalProfileId();
      const localProfile = await getModelProfile(bestLocalId);
      if (localProfile?.vramRequiredMb && gpu.memoryFree < localProfile.vramRequiredMb) {
        return { tier: "cloud", reason: "advanced_routing_insufficient_vram", fallbackAllowed: true };
      }
    }

    const preferred = TASK_TIER[task];
    if (preferred === "cloud") {
      return { tier: "cloud", reason: `task_${task}_default_cloud`, fallbackAllowed: false };
    }

    if (!llm.available) {
      return {
        tier: "cloud",
        reason: gpu.available ? "local_llm_not_running" : "no_gpu_or_local_llm",
        fallbackAllowed: false,
      };
    }

    return { tier: "local", reason: "local_available", fallbackAllowed: true };
  }

  const preferred = TASK_TIER[task];
  if (preferred === "cloud") {
    return { tier: "cloud", reason: `task_${task}_requires_cloud`, fallbackAllowed: false };
  }

  const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);

  if (!llm.available) {
    return {
      tier: "cloud",
      reason: gpu.available ? "local_llm_not_running" : "no_gpu_or_local_llm",
      fallbackAllowed: false,
    };
  }

  const gpuLoad = forcedLoad ?? gpu.utilization ?? 0;

  if (gpu.available && gpuLoad > GPU_OVERLOAD_THRESHOLD) {
    return { tier: "cloud", reason: "gpu_overloaded", fallbackAllowed: true };
  }

  if (gpu.available && gpu.memoryFree !== undefined && gpu.memoryTotal !== undefined) {
    const freeRatio = gpu.memoryFree / gpu.memoryTotal;
    if (freeRatio < GPU_MEMORY_FREE_RATIO_MIN) {
      return { tier: "cloud", reason: "gpu_low_memory", fallbackAllowed: true };
    }
  }

  return { tier: "local", reason: "local_available", fallbackAllowed: true };
}
