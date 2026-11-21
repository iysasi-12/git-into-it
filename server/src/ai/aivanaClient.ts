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

export async function generate(input: string | AivanaMessage[], opts: GenerateOptions = {}): Promise<string> {
  const body = {
    ...(typeof input === "string" ? { prompt: input } : { messages: input }),
    ...(opts.jsonSchema && { response_format: { type: "json_schema", schema: opts.jsonSchema } }),
  };
  let res: Response;
  try {
    res = await fetch(`${env.aivanaBaseUrl}/generate`, {
      method: "POST",
      headers: { "X-API-Key": env.aivanaApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? env.aivanaTimeoutMs),
    });
  } catch (err) {
    throw new AivanaError(`Aivana request failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AivanaError(`Aivana HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as { answer?: unknown; structured?: unknown } | null;
  // With response_format, `structured` is the validated object; `answer` carries the same JSON as text.
  if (data && data.structured && typeof data.structured === "object") return JSON.stringify(data.structured);
  if (!data || typeof data.answer !== "string") throw new AivanaError("Aivana response missing 'answer'.");
  return data.answer;
}
