import { pgTable, text, boolean, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailsTable = pgTable("emails", {
  id: text("id").primaryKey(),
  gmailId: text("gmail_id").unique(),
  threadId: text("thread_id"),
  subject: text("subject").notNull().default("(no subject)"),
  from: text("from").notNull(),
  fromEmail: text("from_email").notNull(),
  to: text("to").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  body: text("body").default(""),
  isRead: boolean("is_read").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(false),
  labels: jsonb("labels").$type<string[]>().default([]),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  category: text("category").notNull().default("PRIMARY"),
  priorityScore: integer("priority_score").notNull().default(50),
  urgency: text("urgency").notNull().default("medium"),
  bundledCount: integer("bundled_count").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailSchema = createInsertSchema(emailsTable);
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type Email = typeof emailsTable.$inferSelect;
