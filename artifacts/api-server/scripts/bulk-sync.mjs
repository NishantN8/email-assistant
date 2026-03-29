// One-time bulk Gmail sync script — runs directly against the DB
// Usage: node scripts/bulk-sync.mjs [maxTotal]
import { google } from "googleapis";
import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const MAX_TOTAL = parseInt(process.argv[2] || "500", 10);
const BATCH = 20;

function decodeBase64(data) {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  } catch { return ""; }
}

function extractBody(payload) {
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

function getHeader(headers, name) {
  return (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseFrom(raw) {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

async function main() {
  // Get user with tokens
  const userRes = await db.query(`SELECT * FROM users WHERE access_token IS NOT NULL LIMIT 1`);
  if (!userRes.rows.length) { console.log("No authenticated user found."); process.exit(1); }
  const user = userRes.rows[0];
  console.log(`[bulk-sync] User: ${user.email}`);

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    expiry_date: user.token_expiry ? new Date(user.token_expiry).getTime() : undefined,
  });

  // Auto-save refreshed token
  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db.query(`UPDATE users SET access_token=$1, token_expiry=$2, updated_at=NOW() WHERE id=$3`,
        [tokens.access_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null, user.id]);
      console.log("[bulk-sync] Token refreshed & saved");
    }
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  // Page through inbox
  console.log(`[bulk-sync] Fetching up to ${MAX_TOTAL} message IDs from inbox…`);
  const allIds = [];
  let pageToken;

  while (allIds.length < MAX_TOTAL) {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      labelIds: ["INBOX"],
      pageToken,
    });
    const ids = (listRes.data.messages || []).map(m => m.id).filter(Boolean);
    allIds.push(...ids);
    pageToken = listRes.data.nextPageToken;
    process.stdout.write(`\r  IDs collected: ${allIds.length} `);
    if (!pageToken || allIds.length >= MAX_TOTAL) break;
  }
  console.log(`\n[bulk-sync] Got ${allIds.length} message IDs. Fetching details in batches of ${BATCH}…`);

  // Check which gmail_ids we already have
  const existingRes = await db.query(`SELECT gmail_id FROM emails WHERE gmail_id IS NOT NULL`);
  const existingIds = new Set(existingRes.rows.map(r => r.gmail_id));
  const newIds = allIds.filter(id => !existingIds.has(id));
  console.log(`[bulk-sync] ${existingIds.size} already stored — ${newIds.length} new to fetch`);

  if (newIds.length === 0) {
    console.log("[bulk-sync] Nothing new to fetch. All emails already in DB.");
    await db.end();
    return;
  }

  // Fetch details for new emails only
  let stored = 0;
  let fetched = 0;

  for (let i = 0; i < newIds.length; i += BATCH) {
    const batch = newIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(id => gmail.users.messages.get({ userId: "me", id, format: "full" }))
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
        await db.query(`
          INSERT INTO emails (
            id, gmail_id, thread_id, subject, "from", from_email, "to",
            snippet, body, labels, received_at, is_read, is_starred,
            category, priority_score, urgency, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
          ON CONFLICT (gmail_id) DO NOTHING
        `, [
          randomUUID(),
          msg.id,
          msg.threadId || null,
          getHeader(headers, "subject") || "(no subject)",
          fromName || fromEmail,
          fromEmail,
          getHeader(headers, "to"),
          previewSnippet,
          body,
          JSON.stringify(labels),
          receivedAt,
          !labels.includes("UNREAD"),
          labels.includes("STARRED"),
          "PRIMARY",
          50,
          "medium",
          new Date(),
        ]);
        stored++;
      } catch (e) {
        // Skip duplicates or constraint errors silently
      }
      fetched++;
    }

    process.stdout.write(`\r  Fetched: ${fetched}/${newIds.length} | Stored new: ${stored} `);
    if (i + BATCH < newIds.length) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n[bulk-sync] Complete — ${stored} new emails stored (${fetched} fetched)`);

  // Save historyId
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    if (profile.data.historyId) {
      await db.query(`UPDATE users SET history_id=$1, updated_at=NOW() WHERE id=$2`,
        [profile.data.historyId, user.id]);
    }
  } catch {}

  await db.end();
  process.exit(0);
}

main().catch(err => {
  console.error("[bulk-sync] Fatal:", err.message);
  process.exit(1);
});
