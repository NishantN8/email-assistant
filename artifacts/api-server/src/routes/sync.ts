import { Router, type IRouter } from "express";
import { batchScoreUnscored } from "./decisions.js";
import { eq, inArray } from "drizzle-orm";
import { google } from "googleapis";
import { db, syncStateTable, emailsTable, usersTable } from "@workspace/db";
import { randomUUID } from "crypto";
import { getAuthClientForUser } from "./auth";

const router: IRouter = Router();
const SYNC_STATE_ID = "main";

// ── Sync state helpers ────────────────────────────
async function getOrCreateSyncState() {
  const rows = await db.select().from(syncStateTable).where(eq(syncStateTable.id, SYNC_STATE_ID)).limit(1);
  if (rows.length > 0) return rows[0];

  const now = new Date();
  await db.insert(syncStateTable).values({
    id: SYNC_STATE_ID,
    status: "idle",
    emailsSynced: 0,
    message: "No sync performed yet",
    createdAt: now,
    updatedAt: now,
  });
  return (await db.select().from(syncStateTable).where(eq(syncStateTable.id, SYNC_STATE_ID)).limit(1))[0];
}

// ── Gmail message parser ──────────────────────────
function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function extractBody(payload: any): { text: string; html: string } {
  if (!payload) return { text: "", html: "" };

  if (payload.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    if (payload.mimeType === "text/html") return { text: "", html: decoded };
    return { text: decoded, html: "" };
  }

  let text = "";
  let html = "";

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        text = decodeBase64(part.body.data);
      } else if (part.mimeType === "text/html" && part.body?.data) {
        html = decodeBase64(part.body.data);
      } else if (part.parts) {
        const nested = extractBody(part);
        if (!text && nested.text) text = nested.text;
        if (!html && nested.html) html = nested.html;
      }
    }
  }

  return { text, html };
}

function getHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

// ── Core Gmail fetch (single page) ───────────────
async function fetchGmailMessages(userId: string, maxMessages = 50) {
  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const gmail = google.gmail({ version: "v1", auth: auth.client });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    maxResults: maxMessages,
    labelIds: ["INBOX"],
    q: "-category:promotions -category:social",
  });

  const messageIds = listRes.data.messages ?? [];
  if (messageIds.length === 0) return [];

  return fetchMessageDetails(gmail, messageIds.slice(0, maxMessages));
}

// ── Paginated bulk fetch (all inbox pages) ────────
async function fetchAllGmailMessages(userId: string, maxTotal = 500) {
  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const gmail = google.gmail({ version: "v1", auth: auth.client });

  const allMessageIds: { id: string }[] = [];
  let pageToken: string | undefined;

  // Page through Gmail list API
  while (allMessageIds.length < maxTotal) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
      pageToken,
    });

    const ids = (listRes.data.messages ?? []).filter((m) => m.id) as { id: string }[];
    allMessageIds.push(...ids);

    pageToken = listRes.data.nextPageToken ?? undefined;
    if (!pageToken || allMessageIds.length >= maxTotal) break;
  }

  if (allMessageIds.length === 0) return [];

  // Fetch details in parallel batches of 20 to avoid rate limits
  const all = allMessageIds.slice(0, maxTotal);
  const parsed = [];
  const BATCH = 20;

  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const results = await fetchMessageDetails(gmail, batch);
    parsed.push(...results);
    // Small pause between batches to be respectful of rate limits
    if (i + BATCH < all.length) await new Promise((r) => setTimeout(r, 100));
  }

  return parsed;
}

// ── Parse message details ─────────────────────────
async function fetchMessageDetails(gmail: any, messageIds: { id: string }[]) {
  const messages = await Promise.allSettled(
    messageIds.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full",
      })
    )
  );

  const parsed = [];

  for (const result of messages) {
    if (result.status !== "fulfilled") continue;
    const msg = (result as any).value.data;
    if (!msg.payload) continue;

    const headers = msg.payload.headers ?? [];
    const { text, html } = extractBody(msg.payload);

    const fromRaw = getHeader(headers, "from");
    const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);

    const dateStr = getHeader(headers, "date");
    const receivedAt = dateStr ? new Date(dateStr) : new Date();

    const labels = msg.labelIds ?? [];
    const snippet = msg.snippet ?? "";
    const bodyText = text || snippet;
    const previewSnippet = bodyText.slice(0, 200).replace(/\s+/g, " ").trim();

    parsed.push({
      gmailId: msg.id!,
      threadId: msg.threadId || null,
      subject: getHeader(headers, "subject") || "(no subject)",
      from: fromName || fromEmail,
      fromEmail,
      to: getHeader(headers, "to"),
      snippet: previewSnippet,
      body: html || text || "",
      labels,
      receivedAt,
      isRead: !labels.includes("UNREAD"),
      isStarred: labels.includes("STARRED"),
      hasAttachment: labels.includes("HAS_ATTACHMENT"),
    });
  }

  return parsed;
}

// ── Incremental sync using History API ────────────
async function fetchNewMessages(userId: string, lastHistoryId: string, maxMessages = 30) {
  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;

  const gmail = google.gmail({ version: "v1", auth: auth.client });

  try {
    const historyRes = await gmail.users.history.list({
      userId: "me",
      startHistoryId: lastHistoryId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
    });

    const historyRecords = historyRes.data.history ?? [];
    const newMessageIds = new Set<string>();

    for (const record of historyRecords) {
      for (const added of (record.messagesAdded ?? [])) {
        if (added.message?.id) newMessageIds.add(added.message.id);
      }
    }

    if (newMessageIds.size === 0) {
      return { messages: [], newHistoryId: historyRes.data.historyId };
    }

    const messages = await Promise.allSettled(
      Array.from(newMessageIds).slice(0, maxMessages).map((id) =>
        gmail.users.messages.get({ userId: "me", id, format: "full" })
      )
    );

    const parsed = [];
    for (const result of messages) {
      if (result.status !== "fulfilled") continue;
      const msg = result.value.data;
      if (!msg.payload) continue;

      const headers = msg.payload.headers ?? [];
      const { text, html } = extractBody(msg.payload);
      const fromRaw = getHeader(headers, "from");
      const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);
      const dateStr = getHeader(headers, "date");
      const receivedAt = dateStr ? new Date(dateStr) : new Date();
      const labels = msg.labelIds ?? [];
      const snippet = msg.snippet ?? "";
      const bodyText = text || snippet;

      parsed.push({
        gmailId: msg.id!,
        subject: getHeader(headers, "subject") || "(no subject)",
        from: fromName || fromEmail,
        fromEmail,
        to: getHeader(headers, "to"),
        snippet: bodyText.slice(0, 200).replace(/\s+/g, " ").trim(),
        body: html || text || "",
        labels,
        receivedAt,
        isRead: !labels.includes("UNREAD"),
        isStarred: labels.includes("STARRED"),
        hasAttachment: labels.includes("HAS_ATTACHMENT"),
      });
    }

    return { messages: parsed, newHistoryId: historyRes.data.historyId };
  } catch (err: any) {
    if (err?.code === 404) {
      // History expired — fall back to full sync
      return null;
    }
    throw err;
  }
}

// ── Store emails to DB ────────────────────────────
async function storeEmails(messages: any[]) {
  let stored = 0;
  for (const msg of messages) {
    try {
      const existing = await db
        .select({ id: emailsTable.id })
        .from(emailsTable)
        .where(eq(emailsTable.gmailId, msg.gmailId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(emailsTable)
          .set({
            isRead: msg.isRead,
            isStarred: msg.isStarred,
            labels: msg.labels,
            updatedAt: new Date(),
          })
          .where(eq(emailsTable.gmailId, msg.gmailId));
        continue;
      }

      const now = new Date();
      await db.insert(emailsTable).values({
        id: randomUUID(),
        gmailId: msg.gmailId,
        subject: msg.subject,
        from: msg.from,
        fromEmail: msg.fromEmail,
        to: msg.to,
        snippet: msg.snippet,
        body: msg.body,
        labels: msg.labels,
        receivedAt: msg.receivedAt,
        isRead: msg.isRead,
        isStarred: msg.isStarred,
        category: "PRIMARY",
        priorityScore: 50,
        urgency: "medium",
        createdAt: now,
        updatedAt: now,
      });
      stored++;
    } catch {
      // Skip individual failures
    }
  }
  return stored;
}

// ── GET current user's profile from Gmail ────────
async function getGmailProfile(userId: string) {
  const auth = await getAuthClientForUser(userId);
  if (!auth) return null;
  const gmail = google.gmail({ version: "v1", auth: auth.client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data;
}

// ── Routes ────────────────────────────────────────

// One-time bulk pull — paginate through entire inbox and store everything
router.post("/sync/bulk", async (req, res) => {
  const sessionUserId = (req as any).session?.userId as string | undefined;
  if (!sessionUserId) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const { maxTotal = 500 } = req.body as { maxTotal?: number };

  // Mark as syncing immediately
  const now = new Date();
  await db.update(syncStateTable)
    .set({ status: "syncing", message: `Bulk fetching up to ${maxTotal} emails…`, updatedAt: now })
    .where(eq(syncStateTable.id, SYNC_STATE_ID));

  // Run in background so we can respond quickly
  setImmediate(async () => {
    try {
      const messages = await fetchAllGmailMessages(sessionUserId, maxTotal);
      if (!messages) throw new Error("Gmail auth failed");

      const stored = await storeEmails(messages as any[]);

      const profile = await getGmailProfile(sessionUserId);
      if (profile?.historyId) {
        await db.update(usersTable)
          .set({ historyId: profile.historyId, updatedAt: new Date() })
          .where(eq(usersTable.id, sessionUserId));
      }

      const completedAt = new Date();
      await db.update(syncStateTable).set({
        status: "idle",
        lastSyncAt: completedAt,
        emailsSynced: stored,
        message: `Bulk sync complete — ${stored} new emails stored (${messages.length} total fetched)`,
        updatedAt: completedAt,
      }).where(eq(syncStateTable.id, SYNC_STATE_ID));

      if (stored > 0) {
        batchScoreUnscored().catch((e) => console.error("Auto-score error:", e));
      }

      console.log(`[bulk-sync] Done — fetched ${messages.length}, stored ${stored} new`);
    } catch (err) {
      console.error("[bulk-sync] Error:", err);
      await db.update(syncStateTable).set({
        status: "error",
        message: `Bulk sync failed: ${(err as Error).message}`,
        updatedAt: new Date(),
      }).where(eq(syncStateTable.id, SYNC_STATE_ID));
    }
  });

  res.json({ status: "started", maxTotal, message: `Bulk sync started — fetching up to ${maxTotal} emails` });
});

router.post("/sync/trigger", async (req, res) => {
  try {
    const sessionUserId = (req as any).session?.userId as string | undefined;
    const state = await getOrCreateSyncState();

    if (state?.status === "syncing") {
      res.json({ status: "syncing", lastSyncAt: state.lastSyncAt?.toISOString() ?? null, emailsSynced: state.emailsSynced, message: "Already syncing" });
      return;
    }

    const now = new Date();
    await db.update(syncStateTable).set({ status: "syncing", message: "Syncing Gmail…", updatedAt: now }).where(eq(syncStateTable.id, SYNC_STATE_ID));

    setImmediate(async () => {
      try {
        let synced = 0;

        if (sessionUserId) {
          // Try incremental sync first
          const userRow = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId)).limit(1);
          const user = userRow[0];

          let messages: any[] | null = null;
          let newHistoryId: string | undefined;

          if (user?.historyId) {
            const incremental = await fetchNewMessages(sessionUserId, user.historyId);
            if (incremental) {
              messages = incremental.messages;
              newHistoryId = incremental.newHistoryId ?? undefined;
            }
          }

          if (!messages) {
            // Full sync
            messages = await fetchGmailMessages(sessionUserId, 50);
            const profile = await getGmailProfile(sessionUserId);
            newHistoryId = profile?.historyId ?? undefined;
          }

          if (messages && messages.length > 0) {
            synced = await storeEmails(messages);
          }

          if (newHistoryId) {
            await db.update(usersTable).set({ historyId: newHistoryId, updatedAt: new Date() }).where(eq(usersTable.id, sessionUserId));
          }
        }

        const completedAt = new Date();
        await db.update(syncStateTable).set({
          status: "idle",
          lastSyncAt: completedAt,
          emailsSynced: synced,
          message: sessionUserId
            ? synced > 0 ? `Synced ${synced} new emails from Gmail` : "Inbox up to date"
            : "Connect Gmail to sync real emails",
          updatedAt: completedAt,
        }).where(eq(syncStateTable.id, SYNC_STATE_ID));

        // Auto-score any unscored emails in the background
        if (synced > 0) {
          batchScoreUnscored().catch((e) => console.error("Auto-score error:", e));
        }
      } catch (err) {
        console.error("Sync error:", err);
        await db.update(syncStateTable).set({ status: "error", message: "Sync failed — check Gmail permissions", updatedAt: new Date() }).where(eq(syncStateTable.id, SYNC_STATE_ID));
      }
    });

    res.json({ status: "syncing", lastSyncAt: state?.lastSyncAt?.toISOString() ?? null, emailsSynced: 0, message: "Sync started" });
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
