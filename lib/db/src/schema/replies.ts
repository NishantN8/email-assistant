import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── replies ───────────────────────────────────────────────────────
export const repliesTable = pgTable("replies", {
  id: text("id").primaryKey(),
  emailId: text("email_id").notNull(),
  tone: text("tone").notNull().default("professional"),
  contentShort: text("content_short").notNull().default(""),
  contentDetailed: text("content_detailed").notNull().default(""),
  contentFriendly: text("content_friendly").notNull().default(""),
  selectedContent: text("selected_content"),
  modelUsed: text("model_used").notNull().default("cloud"),
  isSent: text("is_sent").notNull().default("false"),
  sentAt: timestamp("sent_at"),
  confidence: real("confidence").notNull().default(0.8),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertReplySchema = createInsertSchema(repliesTable);
export type InsertReply = z.infer<typeof insertReplySchema>;
export type Reply = typeof repliesTable.$inferSelect;

// ── user_tone_profiles ────────────────────────────────────────────
// Learns the user's writing style over time
export const toneProfilesTable = pgTable("user_tone_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  preferredTone: text("preferred_tone").notNull().default("professional"),
  exampleReplies: jsonb("example_replies").$type<string[]>().default([]),
  vocabularyHints: jsonb("vocabulary_hints").$type<string[]>().default([]),
  avgReplyLength: text("avg_reply_length").notNull().default("medium"),
  editCount: text("edit_count").notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertToneProfileSchema = createInsertSchema(toneProfilesTable);
export type InsertToneProfile = z.infer<typeof insertToneProfileSchema>;
export type ToneProfile = typeof toneProfilesTable.$inferSelect;
