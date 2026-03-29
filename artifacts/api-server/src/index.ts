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

  if (ENABLE_ADVANCED_ROUTING) {
    try {
      const { seedModelProfiles } = await import("./services/modelProfiles.js");
      await seedModelProfiles();
      logger.info("Model profiles seeded");
    } catch (e) {
      logger.warn({ e }, "Model profile seeding skipped (DB may not be ready)");
    }
  }
});
