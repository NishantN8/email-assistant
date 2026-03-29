import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, emailsTable, userActionsTable, senderMemoryTable } from "@workspace/db";
import { LogActionBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function updateSenderMemory(
  fromEmail: string,
  displayName: string,
  action: string,
  timeSpentMs: number
) {
  const existing = await db
    .select()
    .from(senderMemoryTable)
    .where(eq(senderMemoryTable.fromEmail, fromEmail))
    .limit(1);

  const now = new Date();

  if (existing.length === 0) {
    const openCount = action === "open" ? 1 : 0;
    const replyCount = action === "reply" ? 1 : 0;
    const ignoreCount = action === "ignore" ? 1 : 0;
    const archiveCount = action === "archive" ? 1 : 0;

    const score = calculateImportanceScore({
      totalEmails: 1,
      openCount,
      replyCount,
      ignoreCount,
      archiveCount,
      avgTimeSpentMs: timeSpentMs,
    });

    await db.insert(senderMemoryTable).values({
      id: randomUUID(),
      fromEmail,
      displayName,
      totalEmails: 1,
      openCount,
      replyCount,
      ignoreCount,
      archiveCount,
      avgTimeSpentMs: timeSpentMs,
      lastInteractionAt: now,
      importanceScore: score,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const m = existing[0];
    const newTotal = m.totalEmails + 1;
    const newOpen = action === "open" ? m.openCount + 1 : m.openCount;
    const newReply = action === "reply" ? m.replyCount + 1 : m.replyCount;
    const newIgnore = action === "ignore" ? m.ignoreCount + 1 : m.ignoreCount;
    const newArchive =
      action === "archive" ? m.archiveCount + 1 : m.archiveCount;
    const newAvgTime =
      timeSpentMs > 0
        ? Math.round((m.avgTimeSpentMs * (newTotal - 1) + timeSpentMs) / newTotal)
        : m.avgTimeSpentMs;

    const score = calculateImportanceScore({
      totalEmails: newTotal,
      openCount: newOpen,
      replyCount: newReply,
      ignoreCount: newIgnore,
      archiveCount: newArchive,
      avgTimeSpentMs: newAvgTime,
    });

    await db
      .update(senderMemoryTable)
      .set({
        totalEmails: newTotal,
        openCount: newOpen,
        replyCount: newReply,
        ignoreCount: newIgnore,
        archiveCount: newArchive,
        avgTimeSpentMs: newAvgTime,
        lastInteractionAt: now,
        importanceScore: score,
        updatedAt: now,
      })
      .where(eq(senderMemoryTable.fromEmail, fromEmail));
  }
}

function calculateImportanceScore(stats: {
  totalEmails: number;
  openCount: number;
  replyCount: number;
  ignoreCount: number;
  archiveCount: number;
  avgTimeSpentMs: number;
}) {
  const openRate =
    stats.totalEmails > 0 ? stats.openCount / stats.totalEmails : 0;
  const replyRate =
    stats.totalEmails > 0 ? stats.replyCount / stats.totalEmails : 0;
  const ignoreRate =
    stats.totalEmails > 0 ? stats.ignoreCount / stats.totalEmails : 0;

  const timeBonus = Math.min(0.2, stats.avgTimeSpentMs / 60000);

  const score =
    openRate * 0.3 +
    replyRate * 0.4 -
    ignoreRate * 0.2 +
    timeBonus;

  return Math.min(1, Math.max(0, score));
}

router.post("/actions", async (req, res) => {
  try {
    const body = LogActionBody.parse(req.body);
    const { emailId, action, decisionOverride, timeSpentMs } = body;

    const emailRows = await db
      .select()
      .from(emailsTable)
      .where(eq(emailsTable.id, emailId))
      .limit(1);

    if (emailRows.length === 0) {
      res.status(404).json({ error: "not_found", message: "Email not found" });
      return;
    }

    const email = emailRows[0];

    await db.insert(userActionsTable).values({
      id: randomUUID(),
      emailId,
      fromEmail: email.fromEmail,
      action,
      decisionOverride: decisionOverride ?? null,
      timeSpentMs: timeSpentMs ?? 0,
      createdAt: new Date(),
    });

    if (action === "open") {
      await db
        .update(emailsTable)
        .set({ isRead: true, updatedAt: new Date() })
        .where(eq(emailsTable.id, emailId));
    }

    if (action === "star") {
      await db
        .update(emailsTable)
        .set({ isStarred: true, updatedAt: new Date() })
        .where(eq(emailsTable.id, emailId));
    }

    await updateSenderMemory(
      email.fromEmail,
      email.from,
      action,
      timeSpentMs ?? 0
    );

    res.json({ success: true, memoryUpdated: true });
  } catch (err) {
    req.log.error({ err }, "Failed to log action");
    res.status(500).json({ error: "internal_error", message: "Failed to log action" });
  }
});

export default router;
