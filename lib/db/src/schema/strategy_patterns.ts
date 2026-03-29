import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const strategyPatternsTable = pgTable("strategy_patterns", {
  id: text("id").primaryKey(),
  intent: text("intent").notNull(),
  strategy: text("strategy").notNull(),
  successRate: real("success_rate").notNull().default(0),
  avgResponseTimeMinutes: integer("avg_response_time_minutes"),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStrategyPatternSchema = createInsertSchema(strategyPatternsTable);
export type InsertStrategyPattern = z.infer<typeof insertStrategyPatternSchema>;
export type StrategyPattern = typeof strategyPatternsTable.$inferSelect;
