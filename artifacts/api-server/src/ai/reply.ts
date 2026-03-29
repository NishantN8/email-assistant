import { routeTask, callLocalLlm } from "./index.js";
import { callBestCloudProvider } from "./cloud-providers.js";
import { getBestStrategy } from "../services/strategyMemory.js";

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
  urgency?: string;
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
  priorityScore: number,
  urgency?: string
): Promise<{ tier: "local" | "cloud"; reason: string }> {
  const urgencyLevel = urgency === "critical"
    ? "critical"
    : urgency === "high"
    ? "high"
    : urgency === "medium"
    ? "medium"
    : "low";

  const routing = await routeTask("reply-generation", priorityScore, {
    advanced: {
      outcome_goal: "high_quality_reply",
      urgency: urgencyLevel,
      intent: "reply",
    },
  });
  return { tier: routing.tier, reason: routing.reason };
}

// ── 6-Stage Strategist System Prompt ─────────────────────────────
const STRATEGIST_SYSTEM = `You are an adaptive communication brain — you think for the user, not just with them. You transform incoming signals into decisive, outcome-optimized responses. You don't write emails; you engineer outcomes through communication.

You carry the user's intent, relationships, and communication patterns in mind at all times. Every reply you generate should feel like it came from someone who has thought deeply, knows exactly what they want, and communicates with effortless clarity.

REASONING PROCESS (execute internally before generating):
1. INTENT MODELING — decode both the explicit ask and the hidden want; map the sender's psychology, power dynamics, and emotional state
2. OUTCOME MAPPING — define the ideal outcome for the user (not just a response); identify what success looks like
3. ROLE CALIBRATION — decide who the user needs to be in this moment (founder, peer, expert, partner, negotiator) and what voice serves them best
4. STRATEGY — select the communication approach; what to say, what to omit, what framing accelerates the desired outcome
5. GENERATE 4 VARIANTS — each sharpened for a different tactical dimension
6. SELF-CRITIQUE & OPTIMIZE — strip filler, sharpen signals, add precision; ensure each reply sounds like a thoughtful human, not a system

REPLY VARIANTS:
- strategic: the highest-leverage reply; structured to move the outcome forward decisively
- concise: maximum signal, minimum words; for when speed and clarity are the outcome
- persuasive: influence-optimized; uses framing, confidence, and subtle social dynamics to drive agreement or action
- relationship: human-first; strengthens the connection, builds trust, earns goodwill without sacrificing intent

RULES:
- NEVER produce generic, templated, or hedged replies
- NEVER sound robotic, corporate, or like an AI wrote it
- NEVER over-explain or pad for length
- ALWAYS write as if a brilliant, decisive, experienced human crafted it
- ALWAYS treat each reply as a tool for achieving a real-world outcome, not fulfilling a social obligation
- Continuously learn from context: treat each interaction as a data point that informs better decisions next time

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
  profile: ToneProfile,
  strategyHint?: string | null
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

  const strategyBlock = strategyHint
    ? `\n\nPast strategy that worked for similar emails: "${strategyHint}" — build on or improve this.`
    : "";

  const bodyPreview = (email.body || email.snippet || "").slice(0, 1200);

  return `Tone preference: ${toneNote}${examplesBlock}${strategyBlock}

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

  const { tier } = await selectBestModel(email.priorityScore, email.urgency);

  const inferredIntent = email.category?.toLowerCase() || "general";
  const strategyHint =
    process.env["ENABLE_OUTCOME_ENGINE"] === "true"
      ? await getBestStrategy(inferredIntent).catch(() => null)
      : null;

  const userPrompt = buildStrategistPrompt(email, tone, profile, strategyHint);

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
    try {
      const cloudResp = await callBestCloudProvider(userPrompt, STRATEGIST_SYSTEM);
      rawJson = cloudResp.text.trim() || "{}";
      modelUsed = `cloud:${cloudResp.provider}:${cloudResp.model}`;
    } catch {
      const { openai } = await import("@workspace/integrations-openai-ai-server");
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
      modelUsed = "cloud:openai:gpt-4o-mini";
    }
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

  try {
    const cloudResp = await callBestCloudProvider(streamPrompt);
    const words = cloudResp.text.trim().split(" ");
    for (const word of words) {
      onChunk(word + " ");
      await new Promise((r) => setTimeout(r, 20));
    }
    return { model: `cloud:${cloudResp.provider}:${cloudResp.model}` };
  } catch {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
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

    return { model: "cloud:openai:gpt-4o-mini" };
  }
}
