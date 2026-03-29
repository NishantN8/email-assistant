import { randomUUID } from "crypto";
import { eq, sql, and, gt, desc } from "drizzle-orm";
import { db, emailsTable, outcomeSignalsTable, repliesTable, aiDecisionsTable } from "@workspace/db";
import { recordOutcome as strategyMemoryRecordOutcome } from "./strategyMemory.js";

const IGNORED_THRESHOLD_HOURS = Number(process.env["OUTCOME_IGNORED_THRESHOLD_HOURS"] || "72");

const POSITIVE_KEYWORDS = [
  "thank", "thanks", "appreciate", "perfect", "great", "excellent", "wonderful",
  "agree", "agreed", "sounds good", "confirmed", "yes", "absolutely", "happy to",
];
const NEGATIVE_KEYWORDS = [
  "no", "not interested", "unsubscribe", "cancel", "issue", "problem", "complaint",
  "disappointed", "wrong", "error", "mistake", "concerned", "reject",
];

function classifySentiment(text: string): { type: "positive" | "negative" | "neutral"; score: number } {
  const lower = text.toLowerCase();
  let posHits = 0;
  let negHits = 0;
  for (const kw of POSITIVE_KEYWORDS) if (lower.includes(kw)) posHits++;
  for (const kw of NEGATIVE_KEYWORDS) if (lower.includes(kw)) negHits++;
  if (posHits > negHits) return { type: "positive", score: Math.min(1, posHits * 0.2) };
  if (negHits > posHits) return { type: "negative", score: -Math.min(1, negHits * 0.2) };
  return { type: "neutral", score: 0 };
}

export async function logOutcome(opts: {
  emailId: string;
  threadId?: string | null;
  outcomeType: "response_received" | "ignored" | "positive" | "negative" | "escalated";
  responseTimeMinutes?: number;
  intent?: string;
  strategy?: string;
  bodyText?: string;
}): Promise<void> {
  try {
    const sentiment = opts.bodyText ? classifySentiment(opts.bodyText) : { score: 0, type: "neutral" as const };
    const finalOutcome = opts.bodyText
      ? sentiment.type === "positive"
        ? "positive"
        : sentiment.type === "negative"
        ? "negative"
        : opts.outcomeType
      : opts.outcomeType;

    const existingRows = await db
      .select({ id: outcomeSignalsTable.id })
      .from(outcomeSignalsTable)
      .where(eq(outcomeSignalsTable.emailId, opts.emailId))
      .limit(1);

    if (existingRows.length > 0) {
      await db
        .update(outcomeSignalsTable)
        .set({
          outcomeType: finalOutcome,
          sentimentScore: sentiment.score,
          responseTimeMinutes: opts.responseTimeMinutes ?? null,
          intent: opts.intent ?? "",
          strategy: opts.strategy ?? "",
          threadId: opts.threadId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(outcomeSignalsTable.emailId, opts.emailId));
    } else {
      await db.insert(outcomeSignalsTable).values({
        id: randomUUID(),
        emailId: opts.emailId,
        threadId: opts.threadId ?? null,
        outcomeType: finalOutcome,
        sentimentScore: sentiment.score,
        responseTimeMinutes: opts.responseTimeMinutes ?? null,
        intent: opts.intent ?? "",
        strategy: opts.strategy ?? "",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    if (opts.intent && opts.strategy) {
      strategyMemoryRecordOutcome({
        intent: opts.intent,
        strategy: opts.strategy,
        outcomeType: finalOutcome,
        responseTimeMinutes: opts.responseTimeMinutes,
      }).catch((e) => console.error("[strategyMemory] recordOutcome error:", e));
    }
  } catch (err) {
    console.error("[outcomeEngine] Failed to log outcome:", err);
  }
}

export async function storeReplyContext(opts: {
  emailId: string;
  threadId?: string | null;
  repliedAt: Date;
  receivedAt: Date;
}): Promise<void> {
  try {
    await db
      .update(repliesTable)
      .set({ sentAt: opts.repliedAt, updatedAt: new Date() })
      .where(and(eq(repliesTable.emailId, opts.emailId), eq(repliesTable.isSent, "true")));
    console.log(
      `[outcomeEngine] sentAt persisted for email ${opts.emailId} — ` +
      `time_to_reply_minutes=${Math.max(0, Math.round((opts.repliedAt.getTime() - opts.receivedAt.getTime()) / 60000))}`
    );
  } catch (err) {
    console.error("[outcomeEngine] storeReplyContext error:", err);
  }
}

export async function checkThreadsForResponses(_userId: string): Promise<void> {
  try {
    const inboxEmails = await db
      .select({
        id: emailsTable.id,
        threadId: emailsTable.threadId,
        fromEmail: emailsTable.fromEmail,
        receivedAt: emailsTable.receivedAt,
      })
      .from(emailsTable)
      .where(
        sql`${emailsTable.labels} @> '["INBOX"]'::jsonb`
      )
      .limit(200);

    if (inboxEmails.length === 0) return;

    const existingSignals = await db
      .select({ emailId: outcomeSignalsTable.emailId, outcomeType: outcomeSignalsTable.outcomeType })
      .from(outcomeSignalsTable);

    const signalledOutcomes = new Map(existingSignals.map((s) => [s.emailId, s.outcomeType]));

    const sentReplies = await db
      .select({
        emailId: repliesTable.emailId,
        sentAt: repliesTable.sentAt,
        createdAt: repliesTable.createdAt,
      })
      .from(repliesTable)
      .where(eq(repliesTable.isSent, "true"));

    const repliedEmailIds = new Map<string, Date>();
    const replyCounts = new Map<string, number>();
    for (const r of sentReplies) {
      const existing = repliedEmailIds.get(r.emailId);
      const ts = r.sentAt ?? r.createdAt;
      if (!existing || ts < existing) {
        repliedEmailIds.set(r.emailId, ts);
      }
      replyCounts.set(r.emailId, (replyCounts.get(r.emailId) ?? 0) + 1);
    }

    const allEmails = await db
      .select({
        id: emailsTable.id,
        threadId: emailsTable.threadId,
        fromEmail: emailsTable.fromEmail,
        receivedAt: emailsTable.receivedAt,
        labels: emailsTable.labels,
        snippet: emailsTable.snippet,
      })
      .from(emailsTable);

    const threadEmailsMap = new Map<string, typeof allEmails>();
    for (const e of allEmails) {
      if (!e.threadId) continue;
      const bucket = threadEmailsMap.get(e.threadId) ?? [];
      bucket.push(e);
      threadEmailsMap.set(e.threadId, bucket);
    }

    const TERMINAL_OUTCOMES = new Set(["response_received", "positive", "negative"]);

    for (const email of inboxEmails) {
      const currentOutcome = signalledOutcomes.get(email.id);
      if (currentOutcome && TERMINAL_OUTCOMES.has(currentOutcome)) continue;

      const ageMs = Date.now() - email.receivedAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      const replySentAt = repliedEmailIds.get(email.id);

      if (replySentAt && email.threadId) {
        const siblings = threadEmailsMap.get(email.threadId) ?? [];

        const inboundAfterReply = siblings.filter((e) => {
          const lblArr = Array.isArray(e.labels) ? e.labels as string[] : [];
          const isInbound = !lblArr.includes("SENT") && lblArr.includes("INBOX");
          const arrivedAfterReply = e.receivedAt > replySentAt;
          return isInbound && arrivedAfterReply && e.id !== email.id;
        });

        if (inboundAfterReply.length > 0) {
          const earliest = inboundAfterReply.reduce((min, e) =>
            e.receivedAt < min.receivedAt ? e : min, inboundAfterReply[0]);
          const responseTimeMinutes = Math.max(
            0,
            Math.round((earliest.receivedAt.getTime() - replySentAt.getTime()) / (1000 * 60))
          );

          const decisionRows = await db
            .select()
            .from(aiDecisionsTable)
            .where(eq(aiDecisionsTable.emailId, email.id))
            .limit(1);

          const decision = decisionRows[0];

          await logOutcome({
            emailId: email.id,
            threadId: email.threadId,
            outcomeType: "response_received",
            responseTimeMinutes,
            intent: decision?.category?.toLowerCase() ?? "",
            strategy: decision?.recommendedAction ?? "",
            bodyText: earliest.snippet ?? undefined,
          });
          continue;
        }

        const replySentThresholdMs = Date.now() - replySentAt.getTime();
        const replySentHours = replySentThresholdMs / (1000 * 60 * 60);
        if (replySentHours >= IGNORED_THRESHOLD_HOURS) {
          const decisionRows = await db
            .select()
            .from(aiDecisionsTable)
            .where(eq(aiDecisionsTable.emailId, email.id))
            .limit(1);

          const decision = decisionRows[0];
          const replyCount = replyCounts.get(email.id) ?? 1;
          const outcomeType = replyCount > 1 ? "escalated" : "ignored";

          await logOutcome({
            emailId: email.id,
            threadId: email.threadId,
            outcomeType,
            intent: decision?.category?.toLowerCase() ?? "",
            strategy: decision?.recommendedAction ?? "",
          });
        }
      }
    }
  } catch (err) {
    console.error("[outcomeEngine] checkThreadsForResponses error:", err);
  }
}

let _cronTimer: ReturnType<typeof setInterval> | null = null;

export function startOutcomeCron(intervalMs = 30 * 60 * 1000): void {
  if (_cronTimer) return;
  _cronTimer = setInterval(() => {
    checkThreadsForResponses("system").catch((err) =>
      console.error("[outcomeEngine] cron error:", err)
    );
  }, intervalMs);
  console.log("[outcomeEngine] Outcome cron started (interval:", intervalMs, "ms)");
}

export function stopOutcomeCron(): void {
  if (_cronTimer) {
    clearInterval(_cronTimer);
    _cronTimer = null;
  }
}
