import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

if (!process.env["CUDA_VISIBLE_DEVICES"]) {
  process.env["CUDA_VISIBLE_DEVICES"] = "0";
}
if (!process.env["OLLAMA_NUM_GPU_LAYERS"]) {
  process.env["OLLAMA_NUM_GPU_LAYERS"] = "35";
}
if (!process.env["OLLAMA_GPU_MEMORY_FRACTION"]) {
  process.env["OLLAMA_GPU_MEMORY_FRACTION"] = "0.90";
}

const ENABLE_OUTCOME_ENGINE = process.env["ENABLE_OUTCOME_ENGINE"] === "true";
const ENABLE_TASK_SYSTEM = process.env["ENABLE_TASK_SYSTEM"] === "true";
const ENABLE_ADVANCED_ROUTING = process.env["ENABLE_ADVANCED_ROUTING"] === "true";

const anyBrainUpgrade = ENABLE_OUTCOME_ENGINE || ENABLE_TASK_SYSTEM || ENABLE_ADVANCED_ROUTING;

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  if (anyBrainUpgrade) {
    logger.info(
      { ENABLE_OUTCOME_ENGINE, ENABLE_TASK_SYSTEM, ENABLE_ADVANCED_ROUTING },
      "Brain Upgrade Layer Active"
    );
    console.log("Brain Upgrade Layer Active");
  }

  // Always seed model profiles (RTX 3080 optimized + baseline)
  try {
    const { seedModelProfiles } = await import("./services/modelProfiles.js");
    await seedModelProfiles();
    logger.info("Model profiles seeded (RTX 3080 optimized)");
  } catch (e) {
    logger.warn({ e }, "Model profile seeding skipped (DB may not be ready)");
  }

  // Dynamic Ollama model discovery — register any newly installed models
  try {
    const { discoverAndRegisterModels } = await import("./ai/index.js");
    const discovered = await discoverAndRegisterModels();
    if (discovered.length > 0) {
      logger.info({ count: discovered.length, models: discovered }, "Ollama models discovered and registered");
    } else {
      logger.info("No local Ollama models found (Ollama may not be running)");
    }
  } catch (e) {
    logger.warn({ e }, "Ollama model discovery skipped");
  }

  if (ENABLE_OUTCOME_ENGINE) {
    try {
      const { startOutcomeCron } = await import("./services/outcomeEngine.js");
      startOutcomeCron();
      logger.info("Outcome Engine initialized");
    } catch (e) {
      logger.error({ e }, "Failed to start Outcome Engine");
    }
  }

  if (ENABLE_TASK_SYSTEM) {
    logger.info("Task System enabled");
  }
});
