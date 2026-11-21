import { env } from "../config/env.js";

// Transport only: one prompt in, one answer string out. No business logic.
// API: POST {AIVANA_BASE_URL}/generate  headers X-API-Key  body { prompt }  -> { answer }

export class AivanaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "AivanaError";
  }
}

export async function generate(prompt: string, timeoutMs = env.aivanaTimeoutMs): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${env.aivanaBaseUrl}/generate`, {
      method: "POST",
      headers: { "X-API-Key": env.aivanaApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AivanaError(`Aivana request failed: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AivanaError(`Aivana HTTP ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as { answer?: unknown } | null;
  if (!data || typeof data.answer !== "string") throw new AivanaError("Aivana response missing 'answer'.");
  return data.answer;
}
