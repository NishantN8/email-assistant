import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userActionsTable = pgTable("user_actions", {
  id: text("id").primaryKey(),
  emailId: text("email_id").notNull(),
  fromEmail: text("from_email").notNull().default(""),
  action: text("action").notNull(),
  decisionOverride: text("decision_override"),
  timeSpentMs: integer("time_spent_ms").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserActionSchema = createInsertSchema(userActionsTable);
export type InsertUserAction = z.infer<typeof insertUserActionSchema>;
export type UserAction = typeof userActionsTable.$inferSelect;
