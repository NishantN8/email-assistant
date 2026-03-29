import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modelProfilesTable = pgTable("model_profiles", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull().unique(),
  tier: text("tier").notNull().default("cloud"),
  strengths: jsonb("strengths").$type<string[]>().default([]),
  weaknesses: jsonb("weaknesses").$type<string[]>().default([]),
  bestUseCases: jsonb("best_use_cases").$type<string[]>().default([]),
  avgLatencyMs: integer("avg_latency_ms").default(0),
  qualityScore: real("quality_score").default(0.5),
  vramRequiredMb: integer("vram_required_mb").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertModelProfileSchema = createInsertSchema(modelProfilesTable);
export type InsertModelProfile = z.infer<typeof insertModelProfileSchema>;
export type ModelProfile = typeof modelProfilesTable.$inferSelect;
