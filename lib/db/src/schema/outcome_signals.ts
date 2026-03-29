import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outcomeSignalsTable = pgTable("outcome_signals", {
  id: text("id").primaryKey(),
  emailId: text("email_id").notNull(),
  threadId: text("thread_id"),
  outcomeType: text("outcome_type").notNull().default("unknown"),
  sentimentScore: real("sentiment_score").default(0),
  responseTimeMinutes: integer("response_time_minutes"),
  intent: text("intent").default(""),
  strategy: text("strategy").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOutcomeSignalSchema = createInsertSchema(outcomeSignalsTable);
export type InsertOutcomeSignal = z.infer<typeof insertOutcomeSignalSchema>;
export type OutcomeSignal = typeof outcomeSignalsTable.$inferSelect;
