import { Router, type IRouter } from "express";
import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"]!;
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"]!;
const REDIRECT_URI = process.env["GOOGLE_REDIRECT_URI"]!;

function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

// ── GET /api/auth/google ──────────────────────────
// Initiate OAuth — redirect browser to Google
router.get("/auth/google", (req, res) => {
  const oauth2Client = createOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent",
  });
  res.redirect(url);
});

// ── GET /api/auth/google/callback ─────────────────
// Google redirects here with ?code=...
router.get("/auth/google/callback", async (req, res) => {
  const { code, error } = req.query as Record<string, string>;

  const frontendBase =
    process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "http://localhost:3000";

  if (error || !code) {
    res.redirect(`${frontendBase}/?auth=error`);
    return;
  }

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email) {
      res.redirect(`${frontendBase}/?auth=error`);
      return;
    }

    // Upsert user in DB
    const now = new Date();
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, profile.email))
      .limit(1);

    let userId: string;

    if (existing.length > 0) {
      userId = existing[0].id;
      await db
        .update(usersTable)
        .set({
          name: profile.name ?? existing[0].name,
          picture: profile.picture ?? existing[0].picture ?? "",
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? existing[0].refreshToken,
          tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updatedAt: now,
        })
        .where(eq(usersTable.id, userId));
    } else {
      userId = randomUUID();
      await db.insert(usersTable).values({
        id: userId,
        email: profile.email,
        name: profile.name ?? "",
        picture: profile.picture ?? "",
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Store userId in session
    (req as any).session.userId = userId;

    res.redirect(`${frontendBase}/?auth=success`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const frontendBase =
      process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : "http://localhost:3000";
    res.redirect(`${frontendBase}/?auth=error`);
  }
});

// ── GET /api/auth/me ──────────────────────────────
router.get("/auth/me", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const userId = (req as any).session?.userId;

  if (!userId) {
    res.json({ user: null });
    return;
  }

  try {
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        picture: usersTable.picture,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (rows.length === 0) {
      (req as any).session.userId = null;
      res.json({ user: null });
      return;
    }

    res.json({ user: rows[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to get current user");
    res.status(500).json({ error: "internal_error" });
  }
});

// ── POST /api/auth/logout ─────────────────────────
router.post("/auth/logout", (req, res) => {
  (req as any).session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;

// ── Helper: get OAuth client for a user ──────────
export async function getAuthClientForUser(userId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (rows.length === 0) return null;
  const user = rows[0];
  if (!user.accessToken) return null;

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken ?? undefined,
    expiry_date: user.tokenExpiry?.getTime(),
  });

  // Auto-refresh and save new tokens
  oauth2Client.on("tokens", async (tokens) => {
    await db
      .update(usersTable)
      .set({
        accessToken: tokens.access_token ?? user.accessToken,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : user.tokenExpiry,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  });

  return { client: oauth2Client, user };
}
