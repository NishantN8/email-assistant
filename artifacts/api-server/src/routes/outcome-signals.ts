import { Router, type IRouter } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db, outcomeSignalsTable, emailsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/outcome-signals/:emailId", async (req, res) => {
  try {
    const { emailId } = req.params;

    const emailRows = await db
      .select({ threadId: emailsTable.threadId })
      .from(emailsTable)
      .where(eq(emailsTable.id, emailId))
      .limit(1);

    const threadId = emailRows[0]?.threadId ?? null;

    let rows;
    if (threadId) {
      rows = await db
        .select()
        .from(outcomeSignalsTable)
        .where(
          or(
            eq(outcomeSignalsTable.threadId, threadId),
            eq(outcomeSignalsTable.emailId, emailId)
          )
        )
        .orderBy(desc(outcomeSignalsTable.createdAt))
        .limit(1);
    } else {
      rows = await db
        .select()
        .from(outcomeSignalsTable)
        .where(eq(outcomeSignalsTable.emailId, emailId))
        .orderBy(desc(outcomeSignalsTable.createdAt))
        .limit(1);
    }

    if (rows.length === 0) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const signal = rows[0];
    res.json({
      ...signal,
      createdAt: signal.createdAt.toISOString(),
      updatedAt: signal.updatedAt.toISOString(),
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to get outcome signal");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
