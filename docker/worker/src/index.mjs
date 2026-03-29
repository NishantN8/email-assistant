// Worker entrypoint — boot with health logging
console.log("[worker] Booting BullMQ workers...");
console.log("[worker] Redis:", process.env.REDIS_URL || "redis://localhost:6379");
console.log("[worker] vLLM:", process.env.VLLM_ENDPOINT || "not configured");
console.log("[worker] Ollama:", process.env.OLLAMA_ENDPOINT || "http://localhost:11434");
console.log("[worker] GPU:", process.env.GPU_AVAILABLE === "true" ? "ENABLED" : "disabled");

import "./worker.mjs";
