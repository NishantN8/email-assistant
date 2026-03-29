import { db, emailsTable, userActionsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export type CleanupCategory = "spam" | "newsletter" | "promotion" | "irrelevant";

export interface SpamScore {
  emailId: string;
  heuristicScore: number;
  finalScore: number;
  category: CleanupCategory;
  reasons: string[];
  unsubscribeLink: string | null;
}

const PROMO_KEYWORDS = [
  "sale", "offer", "discount", "deal", "% off", "limited time", "flash sale",
  "exclusive", "coupon", "promo", "savings", "clearance", "free shipping",
  "buy now", "shop now", "today only", "hours left", "ends soon",
  "congratulations", "winner", "claim", "reward", "prize",
  "verify your email", "confirm your", "activate your",
];

const NEWSLETTER_KEYWORDS = [
  "newsletter", "unsubscribe", "weekly digest", "monthly update",
  "issue #", "edition", "roundup", "daily brief", "weekly brief",
  "you're receiving this", "manage preferences", "opt out",
];

const SPAM_KEYWORDS = [
  "nigerian prince", "wire transfer", "bank transfer", "lottery",
  "click here to claim", "you have been selected", "urgent response",
  "make money", "get rich", "crypto opportunity", "investment opportunity",
  "inheritance", "beneficiary",
];

const TRUSTED_DOMAINS = [
  "google.com", "github.com", "microsoft.com", "apple.com", "amazon.com",
  "notion.so", "slack.com", "linear.app", "figma.com", "vercel.com",
  "stripe.com", "twilio.com", "sendgrid.net", "mailchimp.com",
];

const PROMO_CATEGORIES = ["PROMOTIONS", "SOCIAL", "UPDATES", "FORUMS"];

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : "";
}

function extractUnsubscribeLink(body: string): string | null {
  const patterns = [
    /href=["']([^"']*unsubscribe[^"']*)/i,
    /href=["']([^"']*opt.?out[^"']*)/i,
    /href=["']([^"']*manage.?preferences[^"']*)/i,
    /href=["']([^"']*email.?preferences[^"']*)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  const listUnsubscribe = body.match(/List-Unsubscribe[:\s]+<([^>]+)>/i);
  if (listUnsubscribe?.[1]) return listUnsubscribe[1];

  return null;
}

export function computeSpamScore(email: {
  id: string;
  subject: string;
  fromEmail: string;
  snippet: string;
  body: string | null;
  category: string;
  labels: string[] | null;
  priorityScore: number;
  hasReplied?: boolean;
}): SpamScore {
  let score = 0;
  const reasons: string[] = [];
  const textLower = `${email.subject} ${email.snippet}`.toLowerCase();
  const bodyLower = (email.body ?? "").toLowerCase();
  const domain = extractDomain(email.fromEmail);

  // ── category signals ──────────────────────────────────────────────
  if (PROMO_CATEGORIES.includes(email.category)) {
    score += 25;
    reasons.push(`Category: ${email.category}`);
  }

  const labels = email.labels ?? [];
  if (labels.includes("CATEGORY_PROMOTIONS")) { score += 20; reasons.push("Gmail: Promotions"); }
  if (labels.includes("CATEGORY_SOCIAL")) { score += 15; reasons.push("Gmail: Social"); }
  if (labels.includes("CATEGORY_UPDATES")) { score += 10; reasons.push("Gmail: Updates"); }

  // ── keyword signals ───────────────────────────────────────────────
  const promoHits = PROMO_KEYWORDS.filter((kw) => textLower.includes(kw));
  if (promoHits.length >= 2) { score += 20; reasons.push(`Promo keywords: ${promoHits.slice(0, 3).join(", ")}`); }
  else if (promoHits.length === 1) { score += 10; reasons.push(`Promo keyword: ${promoHits[0]}`); }

  const newsletterHits = NEWSLETTER_KEYWORDS.filter((kw) => (textLower + bodyLower).includes(kw));
  if (newsletterHits.length >= 2) { score += 25; reasons.push("Newsletter pattern"); }
  else if (newsletterHits.length === 1) { score += 15; reasons.push("Possible newsletter"); }

  const spamHits = SPAM_KEYWORDS.filter((kw) => textLower.includes(kw));
  if (spamHits.length >= 1) { score += 35; reasons.push(`Spam signals: ${spamHits[0]}`); }

  // ── unsubscribe link ──────────────────────────────────────────────
  const body = email.body ?? "";
  const unsubscribeLink = extractUnsubscribeLink(body);
  if (unsubscribeLink || bodyLower.includes("unsubscribe")) {
    score += 20;
    reasons.push("Has unsubscribe link");
  }

  // ── link/image density ────────────────────────────────────────────
  const linkCount = (body.match(/href=/gi) ?? []).length;
  if (linkCount > 10) { score += 15; reasons.push(`High link count (${linkCount})`); }
  else if (linkCount > 5) { score += 8; }

  const imgCount = (body.match(/<img /gi) ?? []).length;
  if (imgCount > 5) { score += 10; reasons.push("Image-heavy email"); }

  // ── sender trust ──────────────────────────────────────────────────
  const isTrusted = TRUSTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
  if (isTrusted) { score -= 25; reasons.push(`Trusted sender: ${domain}`); }
  else if (domain.match(/\.(xyz|info|biz|click|link|top)$/)) { score += 20; reasons.push(`Suspicious TLD: ${domain}`); }

  // ── priority score inverse ────────────────────────────────────────
  if (email.priorityScore >= 70) { score -= 20; }
  else if (email.priorityScore <= 20) { score += 10; }

  // ── user replied ──────────────────────────────────────────────────
  if (email.hasReplied) { score -= 30; reasons.push("User has replied before"); }

  // ── clamp ─────────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));

  // ── category classification ───────────────────────────────────────
  let category: CleanupCategory;
  if (spamHits.length >= 1 || (domain.match(/\.(xyz|info|biz|click|link|top)$/) && score > 70)) {
    category = "spam";
  } else if (newsletterHits.length >= 2 || (unsubscribeLink !== null && score > 50)) {
    category = "newsletter";
  } else if (PROMO_CATEGORIES.includes(email.category) || promoHits.length >= 2) {
    category = "promotion";
  } else {
    category = "irrelevant";
  }

  return {
    emailId: email.id,
    heuristicScore: score,
    finalScore: score,
    category,
    reasons,
    unsubscribeLink,
  };
}

export async function getCleanupCandidates(limit = 200): Promise<{
  emails: Array<SpamScore & {
    subject: string;
    from: string;
    fromEmail: string;
    snippet: string;
    receivedAt: Date;
  }>;
  summary: { spam: number; newsletter: number; promotion: number; irrelevant: number; total: number };
}> {
  const rows = await db
    .select()
    .from(emailsTable)
    .where(
      sql`NOT (${emailsTable.labels} @> '["SENT"]'::jsonb)
         AND NOT (${emailsTable.labels} @> '["TRASH"]'::jsonb)
         AND NOT (${emailsTable.labels} @> '["ARCHIVE"]'::jsonb)`
    )
    .limit(limit);

  const repliedEmailIds = new Set<string>();
  try {
    const replied = await db
      .select({ emailId: userActionsTable.emailId })
      .from(userActionsTable)
      .where(eq(userActionsTable.action, "reply_sent"));
    replied.forEach((r) => repliedEmailIds.add(r.emailId));
  } catch { /* ignore */ }

  const candidates: Array<SpamScore & {
    subject: string;
    from: string;
    fromEmail: string;
    snippet: string;
    receivedAt: Date;
  }> = [];

  for (const row of rows) {
    const scored = computeSpamScore({
      ...row,
      hasReplied: repliedEmailIds.has(row.id),
    });

    if (scored.finalScore >= 45) {
      candidates.push({ ...scored, subject: row.subject, from: row.from, fromEmail: row.fromEmail, snippet: row.snippet, receivedAt: row.receivedAt });
    }
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);

  const summary = {
    spam: candidates.filter((c) => c.category === "spam").length,
    newsletter: candidates.filter((c) => c.category === "newsletter").length,
    promotion: candidates.filter((c) => c.category === "promotion").length,
    irrelevant: candidates.filter((c) => c.category === "irrelevant").length,
    total: candidates.length,
  };

  return { emails: candidates, summary };
}

export async function executeCleanup(
  emailIds: string[],
  action: "delete" | "archive" | "mark_spam"
): Promise<{ processed: number }> {
  if (emailIds.length === 0) return { processed: 0 };

  const now = new Date();
  let newLabel: string;

  if (action === "delete") {
    newLabel = "TRASH";
  } else if (action === "archive") {
    newLabel = "ARCHIVE";
  } else {
    newLabel = "SPAM";
  }

  const rows = await db
    .select({ id: emailsTable.id, labels: emailsTable.labels })
    .from(emailsTable)
    .where(inArray(emailsTable.id, emailIds));

  for (const row of rows) {
    const existing = (row.labels ?? []).filter((l) => !["INBOX", "TRASH", "SPAM", "ARCHIVE"].includes(l));
    const newLabels = [...existing, newLabel];
    await db
      .update(emailsTable)
      .set({ labels: newLabels, updatedAt: now })
      .where(eq(emailsTable.id, row.id));
  }

  // Log cleanup actions for learning loop
  await db.insert(userActionsTable).values(
    emailIds.map((emailId) => ({
      id: randomUUID(),
      emailId,
      fromEmail: "",
      action: `cleanup_${action}`,
      createdAt: now,
    }))
  );

  return { processed: rows.length };
}

export async function recordSpamFeedback(
  emailId: string,
  feedback: "not_spam" | "is_spam"
): Promise<void> {
  await db.insert(userActionsTable).values({
    id: randomUUID(),
    emailId,
    fromEmail: "",
    action: `spam_feedback_${feedback}`,
    createdAt: new Date(),
  });
}
