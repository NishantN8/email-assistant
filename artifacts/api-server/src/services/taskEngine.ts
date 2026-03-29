import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, tasksTable, emailsTable, aiDecisionsTable } from "@workspace/db";
import type { Task } from "@workspace/db";

export type ActionType = "reply" | "review" | "pay" | "track" | "archive" | "follow_up" | "read";
export type TaskStatus = "needs_action" | "in_progress" | "done";

export interface TaskResult {
  actionType: ActionType;
  taskText: string;
  priority: number;
}

function deriveTask(email: {
  subject: string;
  snippet: string;
  category: string;
  priorityScore: number;
  urgency: string;
  recommendedAction?: string;
}): TaskResult {
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const score = email.priorityScore;

  let actionType: ActionType = "review";
  let taskText = `Review: ${email.subject}`;

  const action = email.recommendedAction?.toLowerCase() ?? "";

  if (action === "reply" || /\breply\b|\brespond\b|\bget back\b/.test(text)) {
    actionType = "reply";
    taskText = `Reply to: ${email.subject}`;
  } else if (action === "pay" || /\bpay\b|\binvoice\b|\bpayment due\b|\bbilling\b/.test(text)) {
    actionType = "pay";
    taskText = `Pay / handle invoice: ${email.subject}`;
  } else if (action === "track" || /\border\b|\bshipping\b|\btracking\b|\bdelivery\b/.test(text)) {
    actionType = "track";
    taskText = `Track order: ${email.subject}`;
  } else if (action === "archive") {
    actionType = "archive";
    taskText = `Archive: ${email.subject}`;
  } else if (/\bfollow.?up\b|\bcheck.?in\b/.test(text)) {
    actionType = "follow_up";
    taskText = `Follow up on: ${email.subject}`;
  } else if (/\bread\b|\bview\b|\bcheck\b/.test(text)) {
    actionType = "read";
    taskText = `Read: ${email.subject}`;
  }

  return { actionType, taskText, priority: score };
}

export async function createTaskForEmail(emailId: string): Promise<void> {
  try {
    const [emailRows, decisionRows] = await Promise.all([
      db.select().from(emailsTable).where(eq(emailsTable.id, emailId)).limit(1),
      db
        .select({ recommendedAction: aiDecisionsTable.recommendedAction })
        .from(aiDecisionsTable)
        .where(eq(aiDecisionsTable.emailId, emailId))
        .limit(1),
    ]);

    if (emailRows.length === 0) return;
    const email = emailRows[0];
    const recommendedAction = decisionRows[0]?.recommendedAction ?? undefined;

    const derived = deriveTask({
      subject: email.subject,
      snippet: email.snippet,
      category: email.category,
      priorityScore: email.priorityScore,
      urgency: email.urgency,
      recommendedAction,
    });

    const existing = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.emailId, emailId))
      .limit(1);

    const now = new Date();

    if (existing.length === 0) {
      await db.insert(tasksTable).values({
        id: randomUUID(),
        emailId,
        actionType: derived.actionType,
        taskText: derived.taskText,
        priority: derived.priority,
        status: "needs_action",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const prev = existing[0];
      const hasChanged =
        prev.actionType !== derived.actionType ||
        prev.taskText !== derived.taskText ||
        prev.priority !== derived.priority;

      if (hasChanged) {
        await db
          .update(tasksTable)
          .set({
            actionType: derived.actionType,
            taskText: derived.taskText,
            priority: derived.priority,
            updatedAt: now,
          })
          .where(eq(tasksTable.emailId, emailId));
      }
    }
  } catch (err) {
    console.error("[taskEngine] createTaskForEmail error:", err);
  }
}

export async function getTasksWithEmails(status?: TaskStatus): Promise<Task[]> {
  try {
    const rows = status
      ? await db.select().from(tasksTable).where(eq(tasksTable.status, status))
      : await db.select().from(tasksTable);

    return rows;
  } catch (err) {
    console.error("[taskEngine] getTasksWithEmails error:", err);
    return [];
  }
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<boolean> {
  try {
    const updated = await db
      .update(tasksTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasksTable.id, taskId))
      .returning({ id: tasksTable.id });
    return updated.length > 0;
  } catch (err) {
    console.error("[taskEngine] updateTaskStatus error:", err);
    return false;
  }
}

export async function getTaskForEmail(emailId: string): Promise<Task | null> {
  try {
    const rows = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.emailId, emailId))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    console.error("[taskEngine] getTaskForEmail error:", err);
    return null;
  }
}
