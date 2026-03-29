import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, syncStateTable } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const SYNC_STATE_ID = "main";

async function getOrCreateSyncState() {
  const rows = await db
    .select()
    .from(syncStateTable)
    .where(eq(syncStateTable.id, SYNC_STATE_ID))
    .limit(1);

  if (rows.length > 0) {
    return rows[0];
  }

  const now = new Date();
  await db.insert(syncStateTable).values({
    id: SYNC_STATE_ID,
    status: "idle",
    emailsSynced: 0,
    message: "No sync performed yet",
    createdAt: now,
    updatedAt: now,
  });

  const created = await db
    .select()
    .from(syncStateTable)
    .where(eq(syncStateTable.id, SYNC_STATE_ID))
    .limit(1);

  return created[0];
}

router.post("/sync/trigger", async (req, res) => {
  try {
    const state = await getOrCreateSyncState();

    if (state && state.status === "syncing") {
      const syncState = state;
      res.json({
        status: syncState.status,
        lastSyncAt: syncState.lastSyncAt?.toISOString() ?? null,
        emailsSynced: syncState.emailsSynced,
        message: "Sync already in progress",
      });
      return;
    }

    const now = new Date();

    await db
      .update(syncStateTable)
      .set({ status: "syncing", message: "Sync started", updatedAt: now })
      .where(eq(syncStateTable.id, SYNC_STATE_ID));

    setImmediate(async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const completedAt = new Date();
        await db
          .update(syncStateTable)
          .set({
            status: "idle",
            lastSyncAt: completedAt,
            emailsSynced: 0,
            message: "Sync complete. Connect Gmail to sync real emails.",
            updatedAt: completedAt,
          })
          .where(eq(syncStateTable.id, SYNC_STATE_ID));
      } catch {
        const errorAt = new Date();
        await db
          .update(syncStateTable)
          .set({
            status: "error",
            message: "Sync failed",
            updatedAt: errorAt,
          })
          .where(eq(syncStateTable.id, SYNC_STATE_ID));
      }
    });

    res.json({
      status: "syncing",
      lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
      emailsSynced: state?.emailsSynced ?? 0,
      message: "Sync started",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to trigger sync");
    res.status(500).json({ error: "internal_error", message: "Failed to trigger sync" });
  }
});

router.get("/sync/status", async (req, res) => {
  try {
    const state = await getOrCreateSyncState();

    res.json({
      status: state?.status ?? "idle",
      lastSyncAt: state?.lastSyncAt?.toISOString() ?? null,
      emailsSynced: state?.emailsSynced ?? 0,
      message: state?.message ?? "",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get sync status");
    res.status(500).json({ error: "internal_error", message: "Failed to get sync status" });
  }
});

export default router;
