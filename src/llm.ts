// Client for any OpenAI-compatible Chat Completions endpoint (Gemini, Groq, OpenAI, OpenRouter,
// a local Ollama...). Plain fetch, no SDK, so switching provider is only a change of env vars.

export type LlmMessage = { role: "system" | "user"; content: string };
export type LlmCall = (messages: LlmMessage[]) => Promise<string>;

export class LlmError extends Error {}

export const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_500;

// "Busy, try again" responses. Free tiers return these fairly often under load.
const BUSY_STATUSES = new Set([429, 500, 503]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const hasLlmKey = () => Boolean(process.env.LLM_API_KEY);

type CompletionResponse = { choices?: { message?: { content?: string } }[] };

// The model is tried twice with a short pause. Only "busy" failures are retried; a wrong key
// fails straight away.
export const callLlm: LlmCall = async (messages) => {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new LlmError("LLM_API_KEY is not set");
  const baseUrl = (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  let error = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAY_MS);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0 }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        const data = (await res.json()) as CompletionResponse;
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
        error = `LLM returned an empty response (${model})`;
        break;
      }

      error = `LLM request failed (${res.status}, ${model})`;
      if (!BUSY_STATUSES.has(res.status)) break;
    } catch (err) {
      error = `LLM request failed (${model}): ${err instanceof Error ? err.message : err}`;
    }
  }
  throw new LlmError(error);
};
