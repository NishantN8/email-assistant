import { Router, type IRouter } from "express";
import { detectGpu, detectLocalLlm, allQueueStats, getCacheStats } from "../ai/index.js";

const router: IRouter = Router();

// GET /api/ai/status — returns GPU, local LLM, queue, and cache state
router.get("/ai/status", async (_req, res) => {
  try {
    const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);
    const queues = allQueueStats();
    const cache = getCacheStats();

    res.json({
      gpu: {
        available: gpu.available,
        name: gpu.name ?? null,
        memoryFree: gpu.memoryFree ?? null,
        memoryTotal: gpu.memoryTotal ?? null,
        utilizationPct: gpu.utilization ?? null,
      },
      localLlm: {
        available: llm.available,
        endpoint: llm.endpoint,
        models: llm.models,
      },
      queues,
      cache,
      routing: {
        localEnabled: llm.available,
        cloudFallbackEnabled: true,
        escalationThreshold: 65,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "status_check_failed" });
  }
});

export default router;
