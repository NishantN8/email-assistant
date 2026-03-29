import { pgTable, text, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiDecisionsTable = pgTable("ai_decisions", {
  id: text("id").primaryKey(),
  emailId: text("email_id").notNull(),
  category: text("category").notNull().default("PRIMARY"),
  priorityScore: integer("priority_score").notNull().default(50),
  urgency: text("urgency").notNull().default("medium"),
  recommendedAction: text("recommended_action").notNull().default("read_later"),
  confidence: real("confidence").notNull().default(0.5),
  reason: text("reason").notNull().default(""),
  summary: text("summary").default(""),
  keyPoints: jsonb("key_points").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAiDecisionSchema = createInsertSchema(aiDecisionsTable);
export type InsertAiDecision = z.infer<typeof insertAiDecisionSchema>;
export type AiDecision = typeof aiDecisionsTable.$inferSelect;
