import { detectLocalLlm } from "./gpu.js";

export interface LlmResponse {
  text: string;
  model: string;
  durationMs: number;
}

const PREFERRED_MODELS = ["llama3", "mistral", "mixtral", "llama2", "phi3"];

function pickModel(available: string[]): string | null {
  for (const preferred of PREFERRED_MODELS) {
    const match = available.find((m) => m.toLowerCase().includes(preferred));
    if (match) return match;
  }
  return available[0] || null;
}

export async function callLocalLlm(
  prompt: string,
  opts: { timeoutMs?: number; model?: string } = {}
): Promise<LlmResponse> {
  const { timeoutMs = 15_000, model: forcedModel } = opts;

  const llm = await detectLocalLlm();
  if (!llm.available) throw new Error("local_llm_unavailable");

  const model = forcedModel || pickModel(llm.models);
  if (!model) throw new Error("no_model_available");

  const t0 = Date.now();

  const resp = await fetch(`${llm.endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`ollama_error: ${err}`);
  }

  const data = (await resp.json()) as { response?: string };
  const text = (data.response || "").trim();

  return { text, model, durationMs: Date.now() - t0 };
}

export async function callLocalLlmBatch(
  prompts: string[],
  opts: { timeoutMs?: number; model?: string } = {}
): Promise<LlmResponse[]> {
  return Promise.all(prompts.map((p) => callLocalLlm(p, opts)));
}
