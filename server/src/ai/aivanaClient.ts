import { env } from "../config/env.js";

// Transport only: a prompt (or a chat history) in, one answer string out. No business logic.
// API: POST {AIVANA_BASE_URL}/generate  headers X-API-Key
//   body { prompt } or { messages: [{ role, content }] }, optional response_format
//   -> { answer, structured? }

export class AivanaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "AivanaError";
  }
}

export interface AivanaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  timeoutMs?: number;
  /** Aivana's native structured output: the reply is validated against this JSON Schema. */
  jsonSchema?: object;
}

/** Longest wait before retrying a concurrency 429, whatever `retry_after_ms` says. */
const MAX_CONCURRENCY_WAIT_MS = 10_000;

/**
 * How long to wait before retrying, if this response is Aivana's "too many requests running at
 * once for this account" 429 (`bucket: "concurrency"`). Null for anything else, including the
 * per-minute rate limit, which a short wait would not fix.
 */
export function concurrencyRetryDelayMs(status: number, bodyText: string): number | null {
  if (status !== 429) return null;
  let error: { bucket?: unknown; retry_after_ms?: unknown } | undefined;
  try {
    error = (JSON.parse(bodyText) as { error?: typeof error }).error;
  } catch {
    return null;
  }
  if (error?.bucket !== "concurrency") return null;
  const ms = typeof error.retry_after_ms === "number" && error.retry_after_ms >= 0 ? error.retry_after_ms : 5000;
  return Math.min(ms, MAX_CONCURRENCY_WAIT_MS);
}

export async function generate(input: string | AivanaMessage[], opts: GenerateOptions = {}): Promise<string> {
  const body = JSON.stringify({
    ...(typeof input === "string" ? { prompt: input } : { messages: input }),
    ...(opts.jsonSchema && { response_format: { type: "json_schema", schema: opts.jsonSchema } }),
  });
  // One deadline for the whole call, so a retry never stretches the caller's timeout.
  const deadline = Date.now() + (opts.timeoutMs ?? env.aivanaTimeoutMs);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${env.aivanaBaseUrl}/generate`, {
        method: "POST",
        headers: { "X-API-Key": env.aivanaApiKey, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
    } catch (err) {
      throw new AivanaError(`Aivana request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // Too many of our requests running at once: wait for one to finish and try once more,
      // if that still leaves time for the retry to get an answer.
      const wait = attempt === 0 ? concurrencyRetryDelayMs(res.status, text) : null;
      if (wait != null && deadline - Date.now() - wait > 5000) {
        console.warn(`[aivana] concurrency limit hit, retrying in ${wait} ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new AivanaError(`Aivana HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    const data = (await res.json().catch(() => null)) as { answer?: unknown; structured?: unknown } | null;
    // With response_format, `structured` is the validated object; `answer` carries the same JSON as text.
    if (data && data.structured && typeof data.structured === "object") return JSON.stringify(data.structured);
    if (!data || typeof data.answer !== "string") throw new AivanaError("Aivana response missing 'answer'.");
    return data.answer;
  }
}
