import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db, strategyPatternsTable, outcomeSignalsTable } from "@workspace/db";

export async function recordOutcome(opts: {
  intent: string;
  strategy: string;
  outcomeType: string;
  responseTimeMinutes?: number | null;
}): Promise<void> {
  try {
    const { intent, strategy, outcomeType, responseTimeMinutes } = opts;
    const isSuccess = outcomeType === "response_received" || outcomeType === "positive";

    const existing = await db
      .select()
      .from(strategyPatternsTable)
      .where(
        and(
          eq(strategyPatternsTable.intent, intent),
          eq(strategyPatternsTable.strategy, strategy)
        )
      )
      .limit(1);

    const now = new Date();

    if (existing.length === 0) {
      await db.insert(strategyPatternsTable).values({
        id: randomUUID(),
        intent,
        strategy,
        successRate: isSuccess ? 1 : 0,
        avgResponseTimeMinutes: responseTimeMinutes ?? null,
        usageCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const row = existing[0];
      const newCount = row.usageCount + 1;
      const prevSuccesses = Math.round(row.successRate * row.usageCount);
      const newSuccesses = prevSuccesses + (isSuccess ? 1 : 0);
      const newSuccessRate = newSuccesses / newCount;

      const prevAvg = row.avgResponseTimeMinutes ?? 0;
      const newAvg =
        responseTimeMinutes != null
          ? Math.round((prevAvg * (newCount - 1) + responseTimeMinutes) / newCount)
          : row.avgResponseTimeMinutes;

      await db
        .update(strategyPatternsTable)
        .set({
          successRate: newSuccessRate,
          avgResponseTimeMinutes: newAvg,
          usageCount: newCount,
          updatedAt: now,
        })
        .where(eq(strategyPatternsTable.id, row.id));
    }
  } catch (err) {
    console.error("[strategyMemory] recordOutcome error:", err);
  }
}

export async function getBestStrategy(intent: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(strategyPatternsTable)
      .where(eq(strategyPatternsTable.intent, intent));

    if (rows.length === 0) return null;

    const sorted = rows.sort((a, b) => {
      const scoreDiff = b.successRate - a.successRate;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return b.usageCount - a.usageCount;
    });

    return sorted[0].strategy;
  } catch (err) {
    console.error("[strategyMemory] getBestStrategy error:", err);
    return null;
  }
}

export async function syncOutcomeSignalsToPatterns(): Promise<void> {
  try {
    const signals = await db
      .select()
      .from(outcomeSignalsTable)
      .limit(500);

    for (const signal of signals) {
      if (!signal.intent || !signal.strategy) continue;
      await recordOutcome({
        intent: signal.intent,
        strategy: signal.strategy,
        outcomeType: signal.outcomeType,
        responseTimeMinutes: signal.responseTimeMinutes,
      });
    }
  } catch (err) {
    console.error("[strategyMemory] syncOutcomeSignalsToPatterns error:", err);
  }
}
