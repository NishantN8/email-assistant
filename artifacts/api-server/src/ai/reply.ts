import { openai } from "@workspace/integrations-openai-ai-server";
import { routeTask, callLocalLlm } from "./index.js";

// ── Types ─────────────────────────────────────────────────────────
export type Tone = "professional" | "friendly" | "brief" | "formal";

export interface ReplyVariant {
  type: "short" | "detailed" | "friendly";
  content: string;
  model: string;
  tone: Tone;
}

export interface GeneratedReplies {
  replies: ReplyVariant[];
  confidence: number;
  modelUsed: string;
}

export interface ReplyEmailContext {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
  receivedAt: Date | null;
  priorityScore: number;
  category: string;
}

export interface ToneProfile {
  preferredTone?: Tone;
  exampleReplies?: string[];
  vocabularyHints?: string[];
  avgReplyLength?: string;
}

// ── In-memory reply cache ─────────────────────────────────────────
const replyCache = new Map<string, { replies: GeneratedReplies; ts: number }>();
const REPLY_CACHE_TTL = 5 * 60 * 1000; // 5 min

function cacheKey(emailId: string, tone: Tone): string {
  return `reply:${emailId}:${tone}`;
}

export function getCachedReplies(emailId: string, tone: Tone): GeneratedReplies | null {
  const entry = replyCache.get(cacheKey(emailId, tone));
  if (!entry || Date.now() - entry.ts > REPLY_CACHE_TTL) return null;
  return entry.replies;
}

function cacheReplies(emailId: string, tone: Tone, replies: GeneratedReplies) {
  replyCache.set(cacheKey(emailId, tone), { replies, ts: Date.now() });
}

// ── Model selection ───────────────────────────────────────────────
async function selectBestModel(
  priorityScore: number
): Promise<{ tier: "local" | "cloud"; reason: string }> {
  const routing = await routeTask("reply-generation", priorityScore);
  return { tier: routing.tier, reason: routing.reason };
}

// ── Prompt builder ────────────────────────────────────────────────
function buildReplyPrompt(
  email: ReplyEmailContext,
  tone: Tone,
  profile: ToneProfile,
  variant: "short" | "detailed" | "friendly"
): string {
  const toneGuide: Record<Tone, string> = {
    professional: "professional, clear, and respectful",
    friendly: "warm, personable, and conversational",
    brief: "concise and direct — no filler words",
    formal: "formal, polished, and structured",
  };

  const lengthGuide = {
    short: "1-2 sentences max. Get straight to the point.",
    detailed: "3-5 sentences. Cover key points thoroughly.",
    friendly: "2-3 sentences. Be warm and personal.",
  };

  const examplesBlock =
    profile.exampleReplies && profile.exampleReplies.length > 0
      ? `\n\nPast reply examples from this user (match their style):\n${profile.exampleReplies.slice(-3).map((e, i) => `${i + 1}. "${e}"`).join("\n")}`
      : "";

  const hintsBlock =
    profile.vocabularyHints && profile.vocabularyHints.length > 0
      ? `\nVocabulary the user prefers: ${profile.vocabularyHints.join(", ")}`
      : "";

  return `You are an elite AI email assistant writing a reply on behalf of the user.

TONE: ${toneGuide[tone]}
LENGTH: ${lengthGuide[variant]}${examplesBlock}${hintsBlock}

EMAIL TO REPLY TO:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
---
${email.body || email.snippet}
---

Write ONLY the reply body text. No greeting required unless natural. No subject line. No "Dear..." unless formal. Do not include "Best regards" or sign-off. Output raw text only.`;
}

// ── Single variant generator ──────────────────────────────────────
async function generateSingleVariant(
  email: ReplyEmailContext,
  tone: Tone,
  variant: "short" | "detailed" | "friendly",
  profile: ToneProfile,
  tier: "local" | "cloud"
): Promise<{ content: string; model: string }> {
  const prompt = buildReplyPrompt(email, tone, profile, variant);

  if (tier === "local") {
    try {
      const resp = await callLocalLlm(prompt, { timeoutMs: 20_000 });
      return { content: resp.text.trim(), model: `local:${resp.model}` };
    } catch {
      // fall through to cloud
    }
  }

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    max_tokens: variant === "short" ? 100 : variant === "detailed" ? 300 : 200,
  });
  const content = resp.choices[0]?.message?.content?.trim() || "";
  return { content, model: "cloud:gpt-4o-mini" };
}

// ── Main: generate all 3 variants ────────────────────────────────
export async function generateReply(
  email: ReplyEmailContext,
  tone: Tone = "professional",
  profile: ToneProfile = {},
  forceRefresh = false
): Promise<GeneratedReplies> {
  if (!forceRefresh) {
    const cached = getCachedReplies(email.id, tone);
    if (cached) return cached;
  }

  const { tier } = await selectBestModel(email.priorityScore);

  const [short, detailed, friendly] = await Promise.all([
    generateSingleVariant(email, tone, "short", profile, tier),
    generateSingleVariant(email, tone, "detailed", profile, tier),
    generateSingleVariant(email, "friendly", "friendly", profile, tier),
  ]);

  const result: GeneratedReplies = {
    replies: [
      { type: "short", content: short.content, model: short.model, tone },
      { type: "detailed", content: detailed.content, model: detailed.model, tone },
      { type: "friendly", content: friendly.content, model: friendly.model, tone: "friendly" },
    ],
    confidence: 0.88,
    modelUsed: tier === "local" ? short.model : "cloud:gpt-4o-mini",
  };

  cacheReplies(email.id, tone, result);
  return result;
}

// ── Streaming variant (SSE) ───────────────────────────────────────
export async function streamReply(
  email: ReplyEmailContext,
  tone: Tone,
  profile: ToneProfile,
  variant: "short" | "detailed" | "friendly",
  onChunk: (chunk: string) => void
): Promise<{ model: string }> {
  const prompt = buildReplyPrompt(email, tone, profile, variant);
  const { tier } = await selectBestModel(email.priorityScore);

  if (tier === "local") {
    try {
      // Ollama doesn't support chunk streaming in our current client,
      // so we get the full response then simulate streaming
      const resp = await callLocalLlm(prompt, { timeoutMs: 20_000 });
      const words = resp.text.trim().split(" ");
      for (const word of words) {
        onChunk(word + " ");
        await new Promise((r) => setTimeout(r, 15));
      }
      return { model: `local:${resp.model}` };
    } catch {
      // fall through to cloud streaming
    }
  }

  // Real OpenAI streaming
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    stream: true,
    temperature: 0.7,
    max_tokens: variant === "short" ? 100 : variant === "detailed" ? 300 : 200,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) onChunk(delta);
  }

  return { model: "cloud:gpt-4o-mini" };
}
