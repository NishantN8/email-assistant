import { openai } from "@workspace/integrations-openai-ai-server";
import { routeTask, callLocalLlm } from "./index.js";

// ── Types ─────────────────────────────────────────────────────────
export type Tone = "professional" | "friendly" | "brief" | "formal";
export type VariantType = "strategic" | "concise" | "persuasive" | "relationship";

export interface ReplyVariant {
  type: VariantType;
  content: string;
  why_it_works: string;
  model: string;
  tone: Tone;
}

export interface GeneratedReplies {
  intent: string;
  role: string;
  strategy: string;
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

// ── 6-Stage Strategist System Prompt ─────────────────────────────
const STRATEGIST_SYSTEM = `You are a world-class communication strategist, elite writer, behavioral psychologist, and decision intelligence engine.

You design communication that achieves outcomes — not just responses.

Your goal: maximize real-world outcome (response, approval, conversion, relationship) while minimizing user effort. The user should rarely need to edit.

EXECUTION STAGES:
1. INTENT MODELING — understand explicit + hidden intent, sender psychology, urgency, stakes
2. ROLE SELECTION — decide who the user should be (founder, engineer, peer, negotiator, etc.)
3. STRATEGY — define primary goal, secondary goal, what to include/avoid
4. GENERATE 4 VARIANTS — each optimized for a different dimension
5. SELF-CRITIQUE — ensure each reply sounds natural, human, outcome-focused
6. MICRO-OPTIMIZE — remove fluff, sharpen phrasing, add subtle persuasion

REPLY VARIANTS:
- strategic: maximizes the desired outcome; well-structured, outcome-driven
- concise: fastest possible reply; ultra-brief, direct, no filler
- persuasive: influence-focused; subtle social proof, confidence framing
- relationship: warm and human; builds trust and rapport

RULES:
- NEVER generate generic replies
- NEVER sound robotic or corporate
- NEVER over-explain
- ALWAYS sound like an experienced, thoughtful human wrote it
- Each reply must feel natural, context-aware, and tailored to the sender's psychology

OUTPUT FORMAT (strict JSON):
{
  "intent": "1 sentence: what they're explicitly asking + what they actually want",
  "role": "who the user should be in this interaction (e.g. 'Senior engineer — clear, decisive')",
  "strategy": "1-2 sentences: communication approach and why",
  "confidence": 0.0 to 1.0,
  "replies": [
    {
      "type": "strategic",
      "content": "the reply text only — no subject line, no greeting unless natural, no sign-off",
      "why_it_works": "1 sentence: the psychological or tactical reason this reply achieves the goal"
    },
    {
      "type": "concise",
      "content": "...",
      "why_it_works": "..."
    },
    {
      "type": "persuasive",
      "content": "...",
      "why_it_works": "..."
    },
    {
      "type": "relationship",
      "content": "...",
      "why_it_works": "..."
    }
  ]
}`;

// ── Strategist prompt builder ─────────────────────────────────────
function buildStrategistPrompt(
  email: ReplyEmailContext,
  tone: Tone,
  profile: ToneProfile
): string {
  const toneNote = {
    professional: "Lean professional and clear.",
    friendly: "Lean warm and conversational.",
    brief: "Keep all replies short — under 3 sentences each.",
    formal: "Use formal language throughout.",
  }[tone];

  const examplesBlock =
    profile.exampleReplies && profile.exampleReplies.length > 0
      ? `\n\nUser's past replies (mirror their voice):\n${profile.exampleReplies
          .slice(-3)
          .map((e, i) => `${i + 1}. "${e}"`)
          .join("\n")}`
      : "";

  const bodyPreview = (email.body || email.snippet || "").slice(0, 1200);

  return `Tone preference: ${toneNote}${examplesBlock}

EMAIL TO REPLY TO:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
Priority score: ${email.priorityScore}/100
Category: ${email.category}
---
${bodyPreview}
---

Analyze the email and generate your structured reply intelligence as JSON.`;
}

// ── Single-call JSON generation (all 4 variants) ──────────────────
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
  const userPrompt = buildStrategistPrompt(email, tone, profile);

  let rawJson = "";
  let modelUsed = "cloud:gpt-4o-mini";

  // Try local first if routed that way
  if (tier === "local") {
    try {
      const resp = await callLocalLlm(
        `${STRATEGIST_SYSTEM}\n\n${userPrompt}`,
        { timeoutMs: 30_000 }
      );
      rawJson = resp.text.trim();
      modelUsed = `local:${resp.model}`;
    } catch {
      // fall through to cloud
    }
  }

  // Cloud JSON mode
  if (!rawJson) {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: STRATEGIST_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
    rawJson = resp.choices[0]?.message?.content?.trim() || "{}";
    modelUsed = "cloud:gpt-4o-mini";
  }

  // Parse and validate
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    parsed = {};
  }

  const variantOrder: VariantType[] = ["strategic", "concise", "persuasive", "relationship"];
  const replies: ReplyVariant[] = variantOrder.map((type) => {
    const found = parsed.replies?.find((r: any) => r.type === type) || {};
    return {
      type,
      content: found.content || "",
      why_it_works: found.why_it_works || "",
      model: modelUsed,
      tone,
    };
  });

  const result: GeneratedReplies = {
    intent: parsed.intent || "",
    role: parsed.role || "",
    strategy: parsed.strategy || "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.88,
    replies,
    modelUsed,
  };

  cacheReplies(email.id, tone, result);
  return result;
}

// ── Streaming variant (SSE) — streams the strategic variant ──────
export async function streamReply(
  email: ReplyEmailContext,
  tone: Tone,
  profile: ToneProfile,
  variant: VariantType | "short" | "detailed" | "friendly",
  onChunk: (chunk: string) => void
): Promise<{ model: string }> {
  const { tier } = await selectBestModel(email.priorityScore);

  // Map legacy variant names
  const variantMap: Record<string, VariantType> = {
    short: "concise",
    detailed: "strategic",
    friendly: "relationship",
  };
  const resolvedVariant = variantMap[variant as string] || (variant as VariantType);

  const variantDesc: Record<VariantType, string> = {
    strategic: "outcome-maximizing, well-structured, decisive",
    concise: "ultra-brief, direct, no filler — maximum 2 sentences",
    persuasive: "influence-focused, confidence-framed, subtle social proof",
    relationship: "warm, human, rapport-building",
  };

  const bodyPreview = (email.body || email.snippet || "").slice(0, 800);
  const streamPrompt = `You are an elite email reply writer.

Write a ${variantDesc[resolvedVariant]} reply to this email.
Tone: ${tone}
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
---
${bodyPreview}
---
Output ONLY the reply text. No subject line. No greeting unless natural. No sign-off.`;

  if (tier === "local") {
    try {
      const resp = await callLocalLlm(streamPrompt, { timeoutMs: 20_000 });
      const words = resp.text.trim().split(" ");
      for (const word of words) {
        onChunk(word + " ");
        await new Promise((r) => setTimeout(r, 15));
      }
      return { model: `local:${resp.model}` };
    } catch {
      // fall through to cloud
    }
  }

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: streamPrompt }],
    stream: true,
    temperature: 0.7,
    max_tokens: resolvedVariant === "concise" ? 80 : 300,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) onChunk(delta);
  }

  return { model: "cloud:gpt-4o-mini" };
}
