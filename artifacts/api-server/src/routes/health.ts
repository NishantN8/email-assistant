import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { detectLocalLlm, detectGpu } from "../ai/gpu.js";
import { allQueueStats } from "../ai/queue.js";
import { allBreakerStats } from "../ai/circuit-breaker.js";
import { getCacheStats } from "../ai/engine.js";
import { getAllProviderStats, getLocalFallbackRate } from "../ai/provider-stats.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const QUEUE_STALL_THRESHOLD_MS = 5 * 60 * 1000;

router.get("/healthz", async (_req, res) => {
  const checks: Record<string, { ok: boolean; reason?: string }> = {};

  const dbCheck = await (async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "db_error" };
    }
  })();
  checks["db"] = dbCheck;

  const llmCheck = await (async () => {
    try {
      const llm = await detectLocalLlm();
      if (!llm.available) {
        return { ok: false, reason: "local_llm_not_reachable" };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "llm_check_error" };
    }
  })();
  checks["llm"] = llmCheck;

  const gpuCheck = await (async () => {
    try {
      const gpu = await detectGpu();
      if (!gpu.available) {
        return { ok: false, reason: "no_gpu_detected" };
      }
      return { ok: true, reason: `gpu_detected:${gpu.name}` };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "gpu_check_error" };
    }
  })();
  checks["gpu"] = gpuCheck;

  const queueCheck = (() => {
    const stats = allQueueStats();
    const now = Date.now();

    for (const q of stats) {
      if (q.waiting > q.maxDepth * 0.9) {
        return {
          ok: false,
          reason: `queue_${q.queue}_near_capacity_${q.waiting}/${q.maxDepth}`,
        };
      }

      if (
        q.waiting > 0 &&
        q.active === 0 &&
        q.last_progress_ms !== null &&
        now - q.last_progress_ms > QUEUE_STALL_THRESHOLD_MS
      ) {
        return {
          ok: false,
          reason: `queue_${q.queue}_stalled_since_${Math.round((now - q.last_progress_ms) / 1000)}s`,
        };
      }
    }

    return { ok: true };
  })();
  checks["queue"] = queueCheck;

  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? "ok" : "degraded";

  const data = HealthCheckResponse.parse({ status });
  res.json({ ...data, checks });
});

router.get("/metrics", async (_req, res) => {
  const [llm, gpu] = await Promise.all([detectLocalLlm(), detectGpu()]);
  const queues = allQueueStats();
  const breakers = allBreakerStats();
  const cache = getCacheStats();
  const providers = getAllProviderStats();
  const fallbackRate = getLocalFallbackRate();

  res.json({
    queues: queues.map((q) => ({
      queue: q.queue,
      depth: q.waiting,
      active: q.active,
      max_depth: q.maxDepth,
      total_processed: q.total_processed,
      dlq_depth: q.dlq_depth,
      last_progress_ms: q.last_progress_ms,
    })),
    circuit_breakers: breakers,
    providers,
    cache: {
      size: cache.size,
      max_size: cache.maxSize,
      hit_rate: cache.hitRate,
      hits: cache.hits,
      misses: cache.misses,
    },
    fallback_rate: fallbackRate,
    gpu: {
      available: gpu.available,
      name: gpu.name,
      utilization: gpu.utilization,
      memory_free_mb: gpu.memoryFree,
      memory_total_mb: gpu.memoryTotal,
    },
    llm: {
      available: llm.available,
      models: llm.models,
      endpoint: llm.endpoint,
    },
  });
});

export default router;
