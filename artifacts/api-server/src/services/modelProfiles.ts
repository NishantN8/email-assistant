import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, modelProfilesTable } from "@workspace/db";

const BASELINE_PROFILES = [
  {
    modelId: "mistral-7b-local",
    tier: "local",
    strengths: ["fast classification", "low latency", "privacy", "cost-free"],
    weaknesses: ["shorter context", "less nuance", "no streaming"],
    bestUseCases: ["classify-email", "summarize-email", "generate-embedding"],
    avgLatencyMs: 3000,
    qualityScore: 0.72,
    vramRequiredMb: 6000,
  },
  {
    modelId: "gpt-4o-mini-cloud",
    tier: "cloud",
    strengths: ["high quality", "long context", "nuanced reasoning", "structured output"],
    weaknesses: ["latency", "cost per token", "requires internet"],
    bestUseCases: ["deep-reasoning", "reply-generation"],
    avgLatencyMs: 2500,
    qualityScore: 0.92,
    vramRequiredMb: 0,
  },
];

export async function seedModelProfiles(): Promise<void> {
  try {
    for (const profile of BASELINE_PROFILES) {
      const existing = await db
        .select({ id: modelProfilesTable.id })
        .from(modelProfilesTable)
        .where(eq(modelProfilesTable.modelId, profile.modelId))
        .limit(1);

      if (existing.length === 0) {
        const now = new Date();
        await db.insert(modelProfilesTable).values({
          id: randomUUID(),
          ...profile,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`[modelProfiles] Seeded profile: ${profile.modelId}`);
      }
    }
  } catch (err) {
    console.error("[modelProfiles] seedModelProfiles error:", err);
  }
}

export async function updateModelLatency(modelId: string, latencyMs: number): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(modelProfilesTable)
      .where(eq(modelProfilesTable.modelId, modelId))
      .limit(1);

    if (existing.length === 0) return;

    const row = existing[0];
    const prevAvg = row.avgLatencyMs ?? 0;
    const newAvg = Math.round((prevAvg * 4 + latencyMs) / 5);

    await db
      .update(modelProfilesTable)
      .set({ avgLatencyMs: newAvg, updatedAt: new Date() })
      .where(eq(modelProfilesTable.modelId, modelId));
  } catch (err) {
    console.error("[modelProfiles] updateModelLatency error:", err);
  }
}

export async function updateModelQuality(modelId: string, qualitySignal: number): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(modelProfilesTable)
      .where(eq(modelProfilesTable.modelId, modelId))
      .limit(1);

    if (existing.length === 0) return;

    const row = existing[0];
    const prevQ = row.qualityScore ?? 0.5;
    const newQ = Math.min(1, Math.max(0, prevQ * 0.9 + qualitySignal * 0.1));

    await db
      .update(modelProfilesTable)
      .set({ qualityScore: newQ, updatedAt: new Date() })
      .where(eq(modelProfilesTable.modelId, modelId));
  } catch (err) {
    console.error("[modelProfiles] updateModelQuality error:", err);
  }
}

export async function getModelProfile(modelId: string) {
  try {
    const rows = await db
      .select()
      .from(modelProfilesTable)
      .where(eq(modelProfilesTable.modelId, modelId))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.error("[modelProfiles] getModelProfile error:", err);
    return null;
  }
}
