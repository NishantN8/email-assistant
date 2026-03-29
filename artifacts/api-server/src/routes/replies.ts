import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { google } from "googleapis";
import { db, emailsTable, repliesTable, toneProfilesTable, usersTable } from "@workspace/db";
import { generateReply, streamReply, type Tone } from "../ai/reply.js";

const router: IRouter = Router();

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"]!,
    process.env["GOOGLE_CLIENT_SECRET"]!,
    process.env["GOOGLE_REDIRECT_URI"]!
  );
}

async function getUserWithTokens(userId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return rows[0] || null;
}

async function getToneProfile(userId: string) {
  const rows = await db.select().from(toneProfilesTable).where(eq(toneProfilesTable.userId, userId)).limit(1);
  return rows[0] || null;
}

// ── POST /api/replies/generate ────────────────────────────────────
// Generate 3 reply variants (short, detailed, friendly)
router.post("/replies/generate", async (req, res) => {
  try {
    const { emailId, tone = "professional", forceRefresh = false } = req.body as {
      emailId: string;
      tone?: Tone;
      forceRefresh?: boolean;
    };

    if (!emailId) {
      res.status(400).json({ error: "missing_email_id" });
      return;
    }

    const emailRows = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId)).limit(1);
    if (!emailRows.length) {
      res.status(404).json({ error: "email_not_found" });
      return;
    }

    const email = emailRows[0];

    // Load tone profile if user is logged in
    const sessionUserId = (req.session as any)?.userId as string | undefined;
    const profile = sessionUserId ? await getToneProfile(sessionUserId) : null;

    const result = await generateReply(
      {
        id: email.id,
        subject: email.subject,
        from: email.from,
        fromEmail: email.fromEmail,
        snippet: email.snippet,
        body: email.body || "",
        receivedAt: email.receivedAt,
        priorityScore: email.priorityScore,
        category: email.category,
      },
      tone,
      {
        preferredTone: (profile?.preferredTone as Tone) || "professional",
        exampleReplies: (profile?.exampleReplies as string[]) || [],
        vocabularyHints: (profile?.vocabularyHints as string[]) || [],
        avgReplyLength: profile?.avgReplyLength || "medium",
      },
      forceRefresh
    );

    // Upsert into replies table (cache in DB too)
    const now = new Date();
    const replyId = randomUUID();
    await db.insert(repliesTable).values({
      id: replyId,
      emailId,
      tone,
      contentShort: result.replies.find((r) => r.type === "short")?.content || "",
      contentDetailed: result.replies.find((r) => r.type === "detailed")?.content || "",
      contentFriendly: result.replies.find((r) => r.type === "friendly")?.content || "",
      modelUsed: result.modelUsed,
      confidence: result.confidence,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();

    res.json({ ...result, replyId });
  } catch (err) {
    console.error("Reply generate error:", err);
    res.status(500).json({ error: "generation_failed", message: (err as Error).message });
  }
});

// ── GET /api/replies/stream ───────────────────────────────────────
// SSE endpoint — streams reply tokens as they're generated
router.get("/replies/stream", async (req, res) => {
  const { emailId, tone = "professional", variant = "detailed" } = req.query as {
    emailId?: string;
    tone?: string;
    variant?: string;
  };

  if (!emailId) {
    res.status(400).json({ error: "missing_email_id" });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const emailRows = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId)).limit(1);
    if (!emailRows.length) {
      send("error", { message: "Email not found" });
      res.end();
      return;
    }

    const email = emailRows[0];
    const sessionUserId = (req.session as any)?.userId as string | undefined;
    const profile = sessionUserId ? await getToneProfile(sessionUserId) : null;

    send("start", { emailId, tone, variant });

    const { model } = await streamReply(
      {
        id: email.id,
        subject: email.subject,
        from: email.from,
        fromEmail: email.fromEmail,
        snippet: email.snippet,
        body: email.body || "",
        receivedAt: email.receivedAt,
        priorityScore: email.priorityScore,
        category: email.category,
      },
      tone as Tone,
      {
        preferredTone: (profile?.preferredTone as Tone) || "professional",
        exampleReplies: (profile?.exampleReplies as string[]) || [],
        vocabularyHints: (profile?.vocabularyHints as string[]) || [],
      },
      variant as "short" | "detailed" | "friendly",
      (chunk) => send("token", { chunk })
    );

    send("done", { model });
    res.end();
  } catch (err) {
    send("error", { message: (err as Error).message });
    res.end();
  }
});

// ── POST /api/replies/send ────────────────────────────────────────
// Send reply via Gmail API
router.post("/replies/send", async (req, res) => {
  try {
    const { emailId, content, replyId } = req.body as {
      emailId: string;
      content: string;
      replyId?: string;
    };

    if (!emailId || !content?.trim()) {
      res.status(400).json({ error: "missing_fields" });
      return;
    }

    const sessionUserId = (req.session as any)?.userId as string | undefined;
    if (!sessionUserId) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const user = await getUserWithTokens(sessionUserId);
    if (!user?.accessToken) {
      res.status(403).json({ error: "no_gmail_access", message: "Re-connect Gmail to enable sending" });
      return;
    }

    const emailRows = await db.select().from(emailsTable).where(eq(emailsTable.id, emailId)).limit(1);
    if (!emailRows.length) {
      res.status(404).json({ error: "email_not_found" });
      return;
    }

    const email = emailRows[0];

    // Build OAuth client with stored tokens
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken || undefined,
      expiry_date: user.tokenExpiry?.getTime(),
    });

    // Auto-refresh token if expired
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await db.update(usersTable).set({
          accessToken: tokens.access_token,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          updatedAt: new Date(),
        }).where(eq(usersTable.id, sessionUserId));
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Build RFC 2822 MIME message
    const subject = email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`;
    const rawMessage = [
      `To: ${email.fromEmail}`,
      `Subject: ${subject}`,
      `In-Reply-To: ${email.gmailId || ""}`,
      `References: ${email.gmailId || ""}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      content.trim(),
    ].join("\r\n");

    const encodedMessage = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sendResult = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId: email.threadId || undefined,
      },
    });

    // Mark as sent in DB
    if (replyId) {
      await db.update(repliesTable).set({
        isSent: "true",
        sentAt: new Date(),
        selectedContent: content,
        updatedAt: new Date(),
      }).where(eq(repliesTable.id, replyId));
    }

    res.json({ success: true, messageId: sendResult.data.id, threadId: sendResult.data.threadId });
  } catch (err) {
    console.error("Reply send error:", err);
    const msg = (err as any)?.message || "send_failed";
    const isAuthError = msg.includes("401") || msg.includes("invalid_grant");
    res.status(isAuthError ? 403 : 500).json({
      error: isAuthError ? "token_expired" : "send_failed",
      message: isAuthError ? "Gmail token expired — please reconnect Gmail" : msg,
    });
  }
});

// ── POST /api/replies/feedback ────────────────────────────────────
// User edited the reply → update tone profile to learn their style
router.post("/replies/feedback", async (req, res) => {
  try {
    const { emailId, editedContent, tone = "professional" } = req.body as {
      emailId: string;
      editedContent: string;
      tone?: Tone;
    };

    const sessionUserId = (req.session as any)?.userId as string | undefined;
    if (!sessionUserId || !editedContent?.trim()) {
      res.json({ ok: true }); // silent success — feedback is optional
      return;
    }

    const existing = await getToneProfile(sessionUserId);
    const now = new Date();

    if (existing) {
      const examples = [...((existing.exampleReplies as string[]) || []), editedContent.trim()].slice(-10);
      const editCount = String(parseInt(existing.editCount || "0", 10) + 1);

      await db.update(toneProfilesTable).set({
        preferredTone: tone,
        exampleReplies: examples,
        editCount,
        updatedAt: now,
      }).where(eq(toneProfilesTable.userId, sessionUserId));
    } else {
      await db.insert(toneProfilesTable).values({
        id: randomUUID(),
        userId: sessionUserId,
        preferredTone: tone,
        exampleReplies: [editedContent.trim()],
        editCount: "1",
        updatedAt: now,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Feedback error:", err);
    res.json({ ok: true }); // never fail the user on feedback
  }
});

export default router;
