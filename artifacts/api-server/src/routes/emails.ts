import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, emailsTable, aiDecisionsTable } from "@workspace/db";
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
      .from(emailsTable);

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

    const whereClause = category
      ? eq(emailsTable.category, category)
      : undefined;

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

export default router;
