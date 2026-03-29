import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const syncStateTable = pgTable("sync_state", {
  id: text("id").primaryKey(),
  historyId: text("history_id"),
  status: text("status").notNull().default("idle"),
  lastSyncAt: timestamp("last_sync_at"),
  emailsSynced: integer("emails_synced").notNull().default(0),
  message: text("message").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSyncStateSchema = createInsertSchema(syncStateTable);
export type InsertSyncState = z.infer<typeof insertSyncStateSchema>;
export type SyncState = typeof syncStateTable.$inferSelect;
