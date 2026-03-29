import { google } from "googleapis";
import { randomUUID } from "crypto";
import { db, emailsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const MAX_TOTAL = parseInt(process.argv[2] || "500", 10);
const BATCH = 20;

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

interface BodyResult { text: string; html: string; }
function extractBody(payload: any): BodyResult {
  if (!payload) return { text: "", html: "" };
  if (payload.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    if (payload.mimeType === "text/html") return { text: "", html: decoded };
    return { text: decoded, html: "" };
  }
  let text = "", html = "";
  for (const part of (payload.parts || [])) {
    if (part.mimeType === "text/plain" && part.body?.data) text = decodeBase64(part.body.data);
    else if (part.mimeType === "text/html" && part.body?.data) html = decodeBase64(part.body.data);
    else if (part.parts) {
      const nested = extractBody(part);
      if (!text && nested.text) text = nested.text;
      if (!html && nested.html) html = nested.html;
    }
  }
  return { text, html };
}

function getHeader(headers: any[], name: string): string {
  return (headers || []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

async function main() {
  const [user] = await db.select().from(usersTable).limit(1);
  if (!user || !user.accessToken) {
    console.log("No authenticated user found.");
    process.exit(1);
  }
  console.log(`[bulk-sync] User: ${user.email}`);

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken ?? undefined,
    expiry_date: user.tokenExpiry ? new Date(user.tokenExpiry).getTime() : undefined,
  });

  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.update(usersTable).set({
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id));
      console.log("[bulk-sync] Token refreshed & saved");
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // Page through inbox list
  console.log(`[bulk-sync] Collecting up to ${MAX_TOTAL} message IDs…`);
  const allIds: string[] = [];
  let pageToken: string | undefined;

  while (allIds.length < MAX_TOTAL) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
      pageToken,
    });
    const ids = (listRes.data.messages || []).map((m) => m.id!).filter(Boolean);
    allIds.push(...ids);
    pageToken = listRes.data.nextPageToken ?? undefined;
    process.stdout.write(`\r  IDs collected: ${allIds.length} `);
    if (!pageToken || allIds.length >= MAX_TOTAL) break;
  }
  console.log(`\n[bulk-sync] Total IDs: ${allIds.length}`);

  // Determine which are already stored
  const existing = await db.select({ gmailId: emailsTable.gmailId }).from(emailsTable);
  const existingSet = new Set(existing.map((e) => e.gmailId).filter(Boolean));
  const newIds = allIds.filter((id) => !existingSet.has(id));
  console.log(`[bulk-sync] Already stored: ${existingSet.size} | New to fetch: ${newIds.length}`);

  if (newIds.length === 0) {
    console.log("[bulk-sync] Nothing new. Inbox is fully synced.");
    process.exit(0);
  }

  let stored = 0;
  let fetched = 0;

  for (let i = 0; i < newIds.length; i += BATCH) {
    const batch = newIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((id) => gmail.users.messages.get({ userId: "me", id, format: "full" }))
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const msg = result.value.data;
      if (!msg.payload) continue;

      const headers = msg.payload.headers ?? [];
      const { text, html } = extractBody(msg.payload);
      const fromRaw = getHeader(headers, "from");
      const { name: fromName, email: fromEmail } = parseFrom(fromRaw);
      const dateStr = getHeader(headers, "date");
      const receivedAt = dateStr ? new Date(dateStr) : new Date();
      const labels = msg.labelIds ?? [];
      const snippet = msg.snippet ?? "";
      const bodyText = text || snippet;
      const previewSnippet = bodyText.slice(0, 200).replace(/\s+/g, " ").trim();
      const body = html || text || "";

      try {
        await db.insert(emailsTable).values({
          id: randomUUID(),
          gmailId: msg.id!,
          threadId: msg.threadId || null,
          subject: getHeader(headers, "subject") || "(no subject)",
          from: fromName || fromEmail,
          fromEmail,
          to: getHeader(headers, "to"),
          snippet: previewSnippet,
          body,
          labels,
          receivedAt,
          isRead: !labels.includes("UNREAD"),
          isStarred: labels.includes("STARRED"),
          category: "PRIMARY",
          priorityScore: 50,
          urgency: "medium",
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
        stored++;
      } catch (_e) {
        // Skip constraint violations silently
      }
      fetched++;
    }

    process.stdout.write(`\r  Progress: ${fetched}/${newIds.length} fetched | ${stored} stored new `);
    if (i + BATCH < newIds.length) await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n[bulk-sync] Done — ${stored} new emails stored (${fetched} processed)`);

  // Update historyId
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      await db.update(usersTable).set({ historyId: profile.data.historyId, updatedAt: new Date() })
        .where(eq(usersTable.id, user.id));
    }
  } catch (_e) {}

  process.exit(0);
}

main().catch((err) => {
  console.error("[bulk-sync] Fatal:", err.message);
  process.exit(1);
});
