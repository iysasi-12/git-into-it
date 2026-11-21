// Guardrails applied to every AI output before it reaches the user.

/** Pull a JSON object out of a model answer (tolerates code fences / chatter). */
export function extractJson(answer: string): unknown {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1] : answer;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object found in answer.");
  return JSON.parse(text.slice(start, end + 1));
}

const NUM_IN_TEXT = /\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?|\$?\d+(?:\.\d+)?/g;
const toNum = (tok: string) => Number(tok.replace(/[$,]/g, ""));

/** Every number that appears anywhere in the facts handed to the AI. */
export function allowedNumbers(...facts: unknown[]): number[] {
  const out = new Set<number>();
  for (const f of facts) for (const m of JSON.stringify(f).match(NUM_IN_TEXT) ?? []) out.add(toNum(m));
  return [...out];
}

const SMALL_NUMBER_LIMIT = 12; // counting words like "2 nights", "3 options" are harmless

/**
 * Replace any number in AI text that is not in the app-computed facts.
 * This enforces "the AI never invents prices/distances/counts".
 */
export function scrubText(text: string, allowed: number[], notes: string[]): string {
  return text.replace(NUM_IN_TEXT, (tok) => {
    const n = toNum(tok);
    if (!tok.startsWith("$") && n <= SMALL_NUMBER_LIMIT) return tok;
    if (allowed.some((a) => Math.abs(a - n) < 0.01)) return tok;
    notes.push(`Removed unverified figure "${tok}" from AI text.`);
    return "[unverified figure removed]";
  });
}

/** Recursively scrub every string in an AI output object. */
export function scrubDeep<T>(value: T, allowed: number[], notes: string[]): T {
  if (typeof value === "string") return scrubText(value, allowed, notes) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, allowed, notes)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, allowed, notes)])) as T;
  }
  return value;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const enumKey = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "");

/**
 * Map a near-miss enum value onto the allowed spelling. Live Aivana tends to drop
 * underscores ("adjustplayers", "daybefore"). Only maps when exactly one allowed
 * value matches, ignoring case, spaces, underscores and hyphens; anything else is
 * returned unchanged so zod still rejects it. Never touches numbers.
 */
export function canonicalEnum(value: unknown, allowed: readonly string[]): unknown {
  if (typeof value !== "string" || allowed.includes(value)) return value;
  const hits = allowed.filter((a) => enumKey(a) === enumKey(value));
  return hits.length === 1 ? hits[0] : value;
}

/** Numbers the user typed (used to verify user-supplied values like budget caps). */
export function numbersInText(text: string): number[] {
  const digits = (text.match(NUM_IN_TEXT) ?? []).map(toNum);

    const words = text
    .toLowerCase()
    .match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g)
    ?.map((word) => NUMBER_WORDS[word]) ?? [];

  return [...digits, ...words];
}
