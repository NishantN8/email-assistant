import { Router, type IRouter } from "express";
import { db, usersTable, toneProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// In-memory model routing preference (resets on server restart — persisted per session)
let modelRouting: {
  preferLocal: boolean;
  cloudEscalationScore: number;
  forceCloud: boolean;
  routingMode: "cloud" | "local" | "hybrid";
} = {
  preferLocal: false,
  cloudEscalationScore: 65,
  forceCloud: true, // default: always use cloud (no local GPU in dev)
  routingMode: "cloud",
};

// ── GET /api/settings ─────────────────────────
router.get("/settings", async (req, res) => {
  const sessionUserId = (req as any).session?.userId as string | undefined;

  let toneProfile = null;
  if (sessionUserId) {
    const rows = await db
      .select()
      .from(toneProfilesTable)
      .where(eq(toneProfilesTable.userId, sessionUserId))
      .limit(1);
    toneProfile = rows[0] || null;
  }

  res.json({
    modelRouting,
    toneProfile: toneProfile
      ? {
          preferredTone: toneProfile.preferredTone,
          avgReplyLength: toneProfile.avgReplyLength,
          editCount: toneProfile.editCount,
          exampleReplies: (toneProfile.exampleReplies as string[]) || [],
          vocabularyHints: (toneProfile.vocabularyHints as string[]) || [],
          updatedAt: toneProfile.updatedAt,
        }
      : null,
  });
});

// ── PATCH /api/settings/model-routing ────────────────────────────
router.patch("/settings/model-routing", async (req, res) => {
  const { preferLocal, cloudEscalationScore, forceCloud, routingMode } = req.body as {
    preferLocal?: boolean;
    cloudEscalationScore?: number;
    forceCloud?: boolean;
    routingMode?: "cloud" | "local" | "hybrid";
  };

  if (routingMode !== undefined) {
    modelRouting.routingMode = routingMode;
    if (routingMode === "cloud") {
      modelRouting.forceCloud = true;
      modelRouting.preferLocal = false;
    } else if (routingMode === "local") {
      modelRouting.forceCloud = false;
      modelRouting.preferLocal = true;
    } else if (routingMode === "hybrid") {
      modelRouting.forceCloud = false;
      modelRouting.preferLocal = false;
    }
  } else {
    if (preferLocal !== undefined) modelRouting.preferLocal = preferLocal;
    if (forceCloud !== undefined) modelRouting.forceCloud = forceCloud;
  }

  if (cloudEscalationScore !== undefined) {
    modelRouting.cloudEscalationScore = Math.max(1, Math.min(100, cloudEscalationScore));
  }

  res.json({ ok: true, modelRouting });
});

// ── PATCH /api/settings/tone-profile ─────────────────────────────
router.patch("/settings/tone-profile", async (req, res) => {
  const sessionUserId = (req as any).session?.userId as string | undefined;
  if (!sessionUserId) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const { preferredTone, avgReplyLength, vocabularyHints } = req.body as {
    preferredTone?: string;
    avgReplyLength?: string;
    vocabularyHints?: string[];
  };

  const now = new Date();
  const existing = await db
    .select()
    .from(toneProfilesTable)
    .where(eq(toneProfilesTable.userId, sessionUserId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(toneProfilesTable)
      .set({
        ...(preferredTone && { preferredTone }),
        ...(avgReplyLength && { avgReplyLength }),
        ...(vocabularyHints && { vocabularyHints }),
        updatedAt: now,
      })
      .where(eq(toneProfilesTable.userId, sessionUserId));
  } else {
    await db.insert(toneProfilesTable).values({
      id: randomUUID(),
      userId: sessionUserId,
      preferredTone: preferredTone || "professional",
      avgReplyLength: avgReplyLength || "medium",
      vocabularyHints: vocabularyHints || [],
      exampleReplies: [],
      editCount: "0",
      updatedAt: now,
    });
  }

  res.json({ ok: true });
});

// ── DELETE /api/settings/tone-profile ────────────────────────────
// Reset learning — clears all learned example replies
router.delete("/settings/tone-profile", async (req, res) => {
  const sessionUserId = (req as any).session?.userId as string | undefined;
  if (!sessionUserId) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  await db
    .update(toneProfilesTable)
    .set({ exampleReplies: [], vocabularyHints: [], editCount: "0", updatedAt: new Date() })
    .where(eq(toneProfilesTable.userId, sessionUserId));

  res.json({ ok: true });
});

export default router;
