import { getCircuitBreaker } from "./circuit-breaker.js";
import { recordProviderCall, sortProvidersByScore } from "./provider-stats.js";

export interface CloudProviderResponse {
  text: string;
  provider: string;
  model: string;
}

interface CloudProviderConfig {
  name: string;
  envKey: string;
  priority: number;
  call: (prompt: string, systemPrompt?: string) => Promise<CloudProviderResponse>;
}

async function callGroq(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
      messages,
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`groq_error: ${err}`);
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };
  const text = data.choices[0]?.message?.content ?? "{}";
  return { text, provider: "groq", model: "llama-4-maverick" };
}

async function callGemini(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const apiKey = process.env["GOOGLE_AI_API_KEY"];
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not set");

  const contents = [];
  if (systemPrompt) {
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood." }] });
  }
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 600,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`gemini_error: ${err}`);
  }

  const data = (await resp.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return { text, provider: "gemini", model: "gemini-2.0-flash" };
}

async function callMistral(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages,
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`mistral_error: ${err}`);
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };
  const text = data.choices[0]?.message?.content ?? "{}";
  return { text, provider: "mistral", model: "mistral-large-3" };
}

async function callOpenRouter(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://email-copilot.replit.app",
      "X-Title": "AI Email Copilot",
    },
    body: JSON.stringify({
      model: "mistralai/mistral-7b-instruct:free",
      messages,
      temperature: 0.1,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`openrouter_error: ${err}`);
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };
  const text = data.choices[0]?.message?.content ?? "{}";
  return { text, provider: "openrouter", model: "mistral-7b-instruct" };
}

async function callOpenAI(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");

  const messages: { role: "system" | "user"; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 600,
  });

  const text = resp.choices[0]?.message?.content ?? "{}";
  return { text, provider: "openai", model: "gpt-4o-mini" };
}

const CLOUD_PROVIDERS: CloudProviderConfig[] = [
  {
    name: "groq",
    envKey: "GROQ_API_KEY",
    priority: 1,
    call: callGroq,
  },
  {
    name: "gemini",
    envKey: "GOOGLE_AI_API_KEY",
    priority: 2,
    call: callGemini,
  },
  {
    name: "mistral",
    envKey: "MISTRAL_API_KEY",
    priority: 3,
    call: callMistral,
  },
  {
    name: "openrouter",
    envKey: "OPENROUTER_API_KEY",
    priority: 4,
    call: callOpenRouter,
  },
];

export async function callBestCloudProvider(
  prompt: string,
  systemPrompt?: string
): Promise<CloudProviderResponse> {
  const available = CLOUD_PROVIDERS.filter(
    (p) => !!process.env[p.envKey]
  );

  const sorted = sortProvidersByScore(available);

  for (const provider of sorted) {
    const breaker = getCircuitBreaker(`cloud:${provider.name}`, {
      tripThresholdMs: 12_000,
      recoveryWindowMs: 30_000,
    });

    if (breaker.isOpen()) {
      continue;
    }

    const t0 = Date.now();
    try {
      const result = await breaker.call(() => provider.call(prompt, systemPrompt));
      recordProviderCall(provider.name, Date.now() - t0, true);
      return result;
    } catch (err) {
      recordProviderCall(provider.name, Date.now() - t0, false);
      console.warn(`[cloud-providers] ${provider.name} failed:`, err);
    }
  }

  const openaiBreaker = getCircuitBreaker("cloud:openai", {
    tripThresholdMs: 12_000,
    recoveryWindowMs: 30_000,
  });

  const t0 = Date.now();
  try {
    const result = await openaiBreaker.call(() => callOpenAI(prompt, systemPrompt));
    recordProviderCall("openai", Date.now() - t0, true);
    return result;
  } catch (err) {
    recordProviderCall("openai", Date.now() - t0, false);
    throw err;
  }
}

export function getAvailableProviders(): string[] {
  const available = CLOUD_PROVIDERS.filter((p) => !!process.env[p.envKey]).map(
    (p) => p.name
  );
  return [...available, "openai"];
}
