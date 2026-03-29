import { Router, type IRouter } from "express";
import { detectGpu, detectLocalLlm, allQueueStats, getCacheStats, getAvailableProviders } from "../ai/index.js";

const router: IRouter = Router();

// GET /api/ai/status — returns GPU, local LLM, queue, and cache state
router.get("/ai/status", async (_req, res) => {
  try {
    const [gpu, llm] = await Promise.all([detectGpu(), detectLocalLlm()]);
    const queues = allQueueStats();
    const cache = getCacheStats();
    const cloudProviders = getAvailableProviders();

    res.json({
      gpu: {
        available: gpu.available,
        name: gpu.name ?? null,
        memoryFree: gpu.memoryFree ?? null,
        memoryTotal: gpu.memoryTotal ?? null,
        utilizationPct: gpu.utilization ?? null,
        cudaAvailable: gpu.cudaAvailable ?? false,
        cudaDevice: gpu.cudaDevice ?? null,
      },
      localLlm: {
        available: llm.available,
        endpoint: llm.endpoint,
        models: llm.models,
        modelCount: llm.models.length,
      },
      cloudProviders,
      queues,
      cache,
      routing: {
        localEnabled: llm.available,
        cloudFallbackEnabled: true,
        escalationThreshold: 65,
        swarmEnabled: true,
      },
      cuda: {
        enabled: gpu.cudaAvailable ?? false,
        device: gpu.cudaDevice ?? null,
        numGpuLayers: parseInt(process.env["OLLAMA_NUM_GPU_LAYERS"] ?? "35"),
        gpuMemoryFraction: parseFloat(process.env["OLLAMA_GPU_MEMORY_FRACTION"] ?? "0.90"),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "status_check_failed" });
  }
});

export default router;
