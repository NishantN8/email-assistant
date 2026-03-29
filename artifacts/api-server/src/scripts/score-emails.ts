import { batchScoreUnscored } from "../routes/decisions.ts";

console.log("[score] Starting batch AI scoring of unscored emails…");
try {
  await batchScoreUnscored();
  console.log("[score] Scoring complete.");
} catch (err) {
  console.error("[score] Error:", (err as Error).message);
}
process.exit(0);
