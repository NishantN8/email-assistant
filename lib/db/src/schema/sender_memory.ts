import { pgTable, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const senderMemoryTable = pgTable("sender_memory", {
  id: text("id").primaryKey(),
  fromEmail: text("from_email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  totalEmails: integer("total_emails").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  ignoreCount: integer("ignore_count").notNull().default(0),
  archiveCount: integer("archive_count").notNull().default(0),
  avgTimeSpentMs: integer("avg_time_spent_ms").notNull().default(0),
  lastInteractionAt: timestamp("last_interaction_at"),
  importanceScore: real("importance_score").notNull().default(0.5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSenderMemorySchema = createInsertSchema(senderMemoryTable);
export type InsertSenderMemory = z.infer<typeof insertSenderMemorySchema>;
export type SenderMemory = typeof senderMemoryTable.$inferSelect;
