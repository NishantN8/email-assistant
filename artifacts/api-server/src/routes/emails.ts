import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, emailsTable, aiDecisionsTable, senderMemoryTable } from "@workspace/db";
import {
  GetEmailsQueryParams,
  GetEmailResponse,
  GetInboxSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/emails/summary", async (req, res) => {
  try {
    const emails = await db
      .select({
        category: emailsTable.category,
        urgency: emailsTable.urgency,
        isRead: emailsTable.isRead,
        priorityScore: emailsTable.priorityScore,
      })
      .from(emailsTable)
      .where(sql`NOT (${emailsTable.labels} @> '["ARCHIVE"]'::jsonb) AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb)`);

    const needsActionCount = emails.filter(
      (e) =>
        e.urgency === "critical" ||
        e.urgency === "high" ||
        e.priorityScore >= 70
    ).length;

    const paymentsCount = emails.filter(
      (e) => e.category === "TRANSACTIONS"
    ).length;

    const criticalCount = emails.filter(
      (e) => e.urgency === "critical"
    ).length;

    const unreadCount = emails.filter((e) => !e.isRead).length;

    const categoryCounts: Record<string, number> = {};
    for (const email of emails) {
      categoryCounts[email.category] =
        (categoryCounts[email.category] || 0) + 1;
    }

    const summary = GetInboxSummaryResponse.parse({
      needsActionCount,
      paymentsCount,
      criticalCount,
      unreadCount,
      categoryCounts,
    });

    res.json(summary);
  } catch (err) {
    req.log.error({ err }, "Failed to get inbox summary");
    res.status(500).json({ error: "internal_error", message: "Failed to get summary" });
  }
});

router.get("/emails", async (req, res) => {
  try {
    const params = GetEmailsQueryParams.safeParse(req.query);
    const category = params.success ? params.data.category : undefined;
    const limit = params.success ? (params.data.limit ?? 50) : 50;
    const offset = params.success ? (params.data.offset ?? 0) : 0;

    // Exclude archived and trashed emails from inbox
    const inboxFilter = sql`NOT (${emailsTable.labels} @> '["ARCHIVE"]'::jsonb) AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb)`;

    const whereClause = category
      ? sql`${emailsTable.category} = ${category} AND NOT (${emailsTable.labels} @> '["ARCHIVE"]'::jsonb) AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb)`
      : inboxFilter;

    const emailRows = await db
      .select()
      .from(emailsTable)
      .where(whereClause)
      .orderBy(desc(emailsTable.priorityScore), desc(emailsTable.receivedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailsTable)
      .where(whereClause);

    const total = Number(totalResult[0]?.count ?? 0);

    const emailIds = emailRows.map((e) => e.id);

    const decisions =
      emailIds.length > 0
        ? await db
            .select()
            .from(aiDecisionsTable)
            .where(
              sql`${aiDecisionsTable.emailId} IN ${sql.raw(
                `(${emailIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`
              )}`
            )
        : [];

    const decisionMap = new Map(decisions.map((d) => [d.emailId, d]));

    const emails = emailRows.map((email) => ({
      email: {
        ...email,
        labels: (email.labels as string[]) || [],
        receivedAt: email.receivedAt.toISOString(),
      },
      decision: decisionMap.has(email.id)
        ? {
            ...decisionMap.get(email.id)!,
            keyPoints:
              (decisionMap.get(email.id)!.keyPoints as string[]) || [],
            createdAt:
              decisionMap.get(email.id)!.createdAt.toISOString(),
            updatedAt:
              decisionMap.get(email.id)!.updatedAt.toISOString(),
          }
        : undefined,
    }));

    res.json({
      emails,
      total,
      hasMore: offset + emailRows.length < total,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get emails");
    res.status(500).json({ error: "internal_error", message: "Failed to get emails" });
  }
});

// ── GET /api/emails/inbox-stats ───────────────
router.get("/emails/inbox-stats", async (req, res) => {
  try {
    const [totalResult, scoredResult, criticalResult, highResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(emailsTable),
      db.select({ count: sql<number>`count(*)` }).from(aiDecisionsTable),
      db.select({ count: sql<number>`count(*)` }).from(emailsTable).where(eq(emailsTable.urgency, "critical")),
      db.select({ count: sql<number>`count(*)` }).from(emailsTable).where(eq(emailsTable.urgency, "high")),
    ]);

    const total = Number(totalResult[0]?.count ?? 0);
    const scored = Number(scoredResult[0]?.count ?? 0);

    res.json({
      totalEmails: total,
      aiScored: scored,
      criticalCount: Number(criticalResult[0]?.count ?? 0),
      highPriorityCount: Number(highResult[0]?.count ?? 0),
      coveragePercent: total > 0 ? Math.round((scored / total) * 100) : 0,
      estimatedMinutesSaved: Math.round(scored * 0.5),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get inbox stats");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/emails/sent ──────────────────────
router.get("/emails/sent", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const rows = await db
      .select()
      .from(emailsTable)
      .where(sql`${emailsTable.labels} @> '["SENT"]'::jsonb`)
      .orderBy(desc(emailsTable.receivedAt))
      .limit(limit)
      .offset(offset);
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailsTable)
      .where(sql`${emailsTable.labels} @> '["SENT"]'::jsonb`);
    res.json({
      emails: rows.map((e) => ({ email: { ...e, labels: (e.labels as string[]) || [], receivedAt: e.receivedAt.toISOString() } })),
      total: Number(totalResult[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get sent emails");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/emails/trash ─────────────────────
router.get("/emails/trash", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const rows = await db
      .select()
      .from(emailsTable)
      .where(sql`${emailsTable.labels} @> '["TRASH"]'::jsonb`)
      .orderBy(desc(emailsTable.receivedAt))
      .limit(limit)
      .offset(offset);
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailsTable)
      .where(sql`${emailsTable.labels} @> '["TRASH"]'::jsonb`);
    res.json({
      emails: rows.map((e) => ({ email: { ...e, labels: (e.labels as string[]) || [], receivedAt: e.receivedAt.toISOString() } })),
      total: Number(totalResult[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get trash emails");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── GET /api/emails/archive ───────────────────
router.get("/emails/archive", async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);
    const rows = await db
      .select()
      .from(emailsTable)
      .where(
        sql`NOT (${emailsTable.labels} @> '["INBOX"]'::jsonb) AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb) AND NOT (${emailsTable.labels} @> '["SENT"]'::jsonb)`
      )
      .orderBy(desc(emailsTable.receivedAt))
      .limit(limit)
      .offset(offset);
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailsTable)
      .where(
        sql`NOT (${emailsTable.labels} @> '["INBOX"]'::jsonb) AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb) AND NOT (${emailsTable.labels} @> '["SENT"]'::jsonb)`
      );
    res.json({
      emails: rows.map((e) => ({ email: { ...e, labels: (e.labels as string[]) || [], receivedAt: e.receivedAt.toISOString() } })),
      total: Number(totalResult[0]?.count ?? 0),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get archive emails");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/emails/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const emailRows = await db
      .select()
      .from(emailsTable)
      .where(eq(emailsTable.id, id))
      .limit(1);

    if (emailRows.length === 0) {
      res.status(404).json({ error: "not_found", message: "Email not found" });
      return;
    }

    const email = emailRows[0];

    const decisionRows = await db
      .select()
      .from(aiDecisionsTable)
      .where(eq(aiDecisionsTable.emailId, id))
      .limit(1);

    const decision = decisionRows[0];

    const result = GetEmailResponse.parse({
      email: {
        ...email,
        labels: (email.labels as string[]) || [],
        receivedAt: email.receivedAt.toISOString(),
      },
      decision: decision
        ? {
            ...decision,
            keyPoints: (decision.keyPoints as string[]) || [],
            createdAt: decision.createdAt.toISOString(),
            updatedAt: decision.updatedAt.toISOString(),
          }
        : undefined,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get email");
    res.status(500).json({ error: "internal_error", message: "Failed to get email" });
  }
});

// ── POST /api/emails/:id/archive ─────────────
router.post("/emails/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;

    const emailRows = await db
      .select()
      .from(emailsTable)
      .where(eq(emailsTable.id, id))
      .limit(1);

    if (emailRows.length === 0) {
      res.status(404).json({ error: "not_found", message: "Email not found" });
      return;
    }

    const email = emailRows[0];
    const currentLabels = (email.labels as string[]) || [];
    const updatedLabels = currentLabels
      .filter((l) => l !== "INBOX")
      .concat("ARCHIVE");

    await db
      .update(emailsTable)
      .set({ labels: updatedLabels })
      .where(eq(emailsTable.id, id));

    res.json({ ok: true, labels: updatedLabels });
  } catch (err) {
    req.log.error({ err }, "Failed to archive email");
    res.status(500).json({ error: "internal_error", message: "Failed to archive email" });
  }
});

// ── GET /api/emails/:id/sender ────────────────
// Returns sender memory stats for the email's from-address
router.get("/emails/:id/sender", async (req, res) => {
  try {
    const { id } = req.params;

    const emailRows = await db
      .select({ fromEmail: emailsTable.fromEmail, from: emailsTable.from })
      .from(emailsTable)
      .where(eq(emailsTable.id, id))
      .limit(1);

    if (emailRows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const { fromEmail, from: displayName } = emailRows[0];

    const memRows = await db
      .select()
      .from(senderMemoryTable)
      .where(eq(senderMemoryTable.fromEmail, fromEmail))
      .limit(1);

    if (memRows.length === 0) {
      res.json({
        fromEmail,
        displayName,
        totalEmails: 0,
        openCount: 0,
        replyCount: 0,
        ignoreCount: 0,
        archiveCount: 0,
        importanceScore: 0.5,
        lastInteractionAt: null,
        openRate: 0,
        replyRate: 0,
        ignoreRate: 0,
      });
      return;
    }

    const m = memRows[0];
    const total = m.totalEmails || 1;

    res.json({
      fromEmail: m.fromEmail,
      displayName: m.displayName,
      totalEmails: m.totalEmails,
      openCount: m.openCount,
      replyCount: m.replyCount,
      ignoreCount: m.ignoreCount,
      archiveCount: m.archiveCount,
      importanceScore: m.importanceScore,
      lastInteractionAt: m.lastInteractionAt?.toISOString() ?? null,
      openRate: m.openCount / total,
      replyRate: m.replyCount / total,
      ignoreRate: m.ignoreCount / total,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get sender stats");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
