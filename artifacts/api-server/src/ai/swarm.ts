import { callLocalLlm } from "./local-llm.js";
import { callBestCloudProvider } from "./cloud-providers.js";
import { detectLocalLlm } from "./gpu.js";

export interface AgentResult {
  agent: string;
  finding: string;
  confidence: number;
}

export interface SwarmResult {
  agents: AgentResult[];
  finalCategory: string;
  finalPriorityScore: number;
  finalAction: string;
  votedConfidence: number;
  modelUsed: string;
}

interface EmailInput {
  subject: string;
  from: string;
  fromEmail: string;
  snippet: string;
  body: string;
}

function buildAgentPrompt(
  agentRole: string,
  agentTask: string,
  email: EmailInput,
  outputFormat: string
): string {
  const body = (email.body || email.snippet || "").slice(0, 800);
  return `You are a specialized email analysis agent: ${agentRole}

Your task: ${agentTask}

Email:
From: ${email.from} <${email.fromEmail}>
Subject: ${email.subject}
---
${body}
---

${outputFormat}

Respond ONLY with valid JSON.`;
}

async function callAgent(prompt: string, useCloud: boolean): Promise<string> {
  if (!useCloud) {
    try {
      const resp = await callLocalLlm(prompt, { timeoutMs: 10_000 });
      return resp.text;
    } catch {
      // fall through to cloud
    }
  }
  try {
    const resp = await callBestCloudProvider(prompt);
    return resp.text;
  } catch {
    return "{}";
  }
}

function parseConfidence(raw: string, field = "confidence"): number {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const val = Number(parsed[field] ?? parsed.confidence ?? 0.5);
    return Math.min(1, Math.max(0, val));
  } catch {
    return 0.5;
  }
}

function parseStringField(raw: string, field: string, fallback = ""): string {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return String(parsed[field] ?? fallback);
  } catch {
    return fallback;
  }
}

function parseNumberField(raw: string, field: string, fallback = 0): number {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Number(parsed[field] ?? fallback);
  } catch {
    return fallback;
  }
}

async function runIntentAgent(
  email: EmailInput,
  useCloud: boolean
): Promise<AgentResult> {
  const prompt = buildAgentPrompt(
    "Intent Analyst",
    "Determine what the sender explicitly asks for AND what they actually want (hidden intent). Detect the psychological motivation behind this email.",
    email,
    `Return JSON: {"intent": "one clear sentence describing both explicit ask and true motive", "confidence": 0.0-1.0}`
  );
  const raw = await callAgent(prompt, useCloud);
  return {
    agent: "Intent Agent",
    finding: parseStringField(raw, "intent", "Intent analysis unavailable"),
    confidence: parseConfidence(raw),
  };
}

async function runUrgencyAgent(
  email: EmailInput,
  useCloud: boolean
): Promise<AgentResult> {
  const prompt = buildAgentPrompt(
    "Urgency Evaluator",
    "Assess how time-sensitive this email is. Consider: deadlines, consequences of delay (1hr, 24hr, 72hr), sender authority, and implicit urgency signals.",
    email,
    `Return JSON: {"urgency_level": "critical|high|medium|low", "time_sensitivity": "brief explanation of consequence if delayed 24hrs", "score": 0-100, "confidence": 0.0-1.0}`
  );
  const raw = await callAgent(prompt, useCloud);
  const level = parseStringField(raw, "urgency_level", "medium");
  const timeSensitivity = parseStringField(
    raw,
    "time_sensitivity",
    "Standard priority"
  );
  return {
    agent: "Urgency Agent",
    finding: `${level.toUpperCase()}: ${timeSensitivity}`,
    confidence: parseConfidence(raw),
  };
}

async function runToneAgent(
  email: EmailInput,
  useCloud: boolean
): Promise<AgentResult> {
  const prompt = buildAgentPrompt(
    "Tone & Sentiment Analyst",
    "Identify the emotional register and communication style of this email. Detect underlying emotions, pressure tactics, or relationship signals.",
    email,
    `Return JSON: {"tone": "formal|casual|urgent|aggressive|friendly|neutral|anxious|demanding", "sentiment": "positive|negative|neutral|mixed", "emotional_cues": "brief description of key emotional signals detected", "confidence": 0.0-1.0}`
  );
  const raw = await callAgent(prompt, useCloud);
  const tone = parseStringField(raw, "tone", "neutral");
  const sentiment = parseStringField(raw, "sentiment", "neutral");
  const cues = parseStringField(raw, "emotional_cues", "");
  return {
    agent: "Tone Agent",
    finding: cues ? `${tone} / ${sentiment} — ${cues}` : `${tone} / ${sentiment}`,
    confidence: parseConfidence(raw),
  };
}

async function runActionAgent(
  email: EmailInput,
  useCloud: boolean
): Promise<AgentResult> {
  const prompt = buildAgentPrompt(
    "Action Recommender",
    "Determine the single best action the recipient should take with this email and why. Consider context, urgency, and relationship value.",
    email,
    `Return JSON: {"action": "reply|pay|review|read|archive|delete|none", "reasoning": "one sentence justification for this action", "priority_score": 0-100, "confidence": 0.0-1.0}`
  );
  const raw = await callAgent(prompt, useCloud);
  const action = parseStringField(raw, "action", "read");
  const reasoning = parseStringField(
    raw,
    "reasoning",
    "Standard processing recommended"
  );
  return {
    agent: "Action Agent",
    finding: `${action.toUpperCase()}: ${reasoning}`,
    confidence: parseConfidence(raw),
  };
}

async function runReplyQualityCritic(
  email: EmailInput,
  useCloud: boolean
): Promise<AgentResult> {
  const prompt = buildAgentPrompt(
    "Reply Quality Critic",
    "Evaluate whether a reply is warranted and what quality level it should be. Consider if a reply would be beneficial, ignored, or counterproductive.",
    email,
    `Return JSON: {"reply_warranted": true|false, "quality_needed": "none|quick|thoughtful|strategic", "key_points_to_address": "comma-separated list of 1-3 points", "confidence": 0.0-1.0}`
  );
  const raw = await callAgent(prompt, useCloud);
  const warranted = parseStringField(raw, "reply_warranted", "false");
  const quality = parseStringField(raw, "quality_needed", "none");
  const points = parseStringField(raw, "key_points_to_address", "");
  const finding = warranted === "true" || warranted === true as unknown as string
    ? `${quality} reply needed${points ? ` — cover: ${points}` : ""}`
    : "No reply needed";
  return {
    agent: "Reply Quality Critic",
    finding,
    confidence: parseConfidence(raw),
  };
}

function aggregateSwarmResults(
  agentResults: AgentResult[],
  baseScore: number,
  baseCategory: string,
  baseAction: string
): Omit<SwarmResult, "agents" | "modelUsed"> {
  const actionAgent = agentResults.find((a) => a.agent === "Action Agent");
  const urgencyAgent = agentResults.find((a) => a.agent === "Urgency Agent");

  let finalAction = baseAction;
  if (actionAgent) {
    const match = actionAgent.finding.match(/^([A-Z]+):/);
    if (match) {
      const extracted = match[1].toLowerCase();
      const validActions = ["reply", "pay", "review", "read", "archive", "delete", "none"];
      if (validActions.includes(extracted)) finalAction = extracted;
    }
  }

  let scoreDelta = 0;
  if (urgencyAgent) {
    const finding = urgencyAgent.finding.toLowerCase();
    if (finding.includes("critical")) scoreDelta += 15;
    else if (finding.includes("high")) scoreDelta += 8;
    else if (finding.includes("low")) scoreDelta -= 5;
  }

  const finalPriorityScore = Math.min(100, Math.max(0, baseScore + scoreDelta));

  const avgConfidence =
    agentResults.reduce((sum, a) => sum + a.confidence, 0) / agentResults.length;

  return {
    finalCategory: baseCategory,
    finalPriorityScore,
    finalAction,
    votedConfidence: Math.round(avgConfidence * 100) / 100,
  };
}

export async function runSwarmAnalysis(
  email: EmailInput,
  baseScore: number,
  baseCategory: string,
  baseAction: string
): Promise<SwarmResult> {
  const llmStatus = await detectLocalLlm();
  const useCloud = !llmStatus.available;

  const [intentResult, urgencyResult, toneResult, actionResult, replyResult] =
    await Promise.all([
      runIntentAgent(email, useCloud),
      runUrgencyAgent(email, useCloud),
      runToneAgent(email, useCloud),
      runActionAgent(email, useCloud),
      runReplyQualityCritic(email, useCloud),
    ]);

  const agents = [
    intentResult,
    urgencyResult,
    toneResult,
    actionResult,
    replyResult,
  ];

  const aggregated = aggregateSwarmResults(
    agents,
    baseScore,
    baseCategory,
    baseAction
  );

  const modelUsed = useCloud ? "cloud:swarm" : "local:swarm";

  return {
    agents,
    ...aggregated,
    modelUsed,
  };
}
