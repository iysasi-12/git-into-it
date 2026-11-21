import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TripRequest, WhatIfCommand } from "@app/shared";
import { buildPlan } from "../engine/optionBuilder.js";
import { memoFacts, planFacts } from "../engine/summary.js";
import { allowedNumbers, extractJson, scrubDeep } from "./guards.js";
import { MemoSchema, ParsedRequestSchema, RecommendationSchema, WhatIfCommandSchema } from "./schemas.js";

type Capture = {
  task: "parse" | "recommend" | "whatif" | "memo";
  input: string;
  answer: string;
  expected: "valid" | "known-bad";
  expectedCommand?: Partial<WhatIfCommand>;
};

// Keep identical to `base` in scripts/captureLive.ts.
const base: TripRequest = {
  opponentId: "ohio-state",
  gameDate: "2027-10-09",
  players: 65,
  coaches: 8,
  staff: 4,
  departure: "day_before",
  earliestDepartureTime: "14:00",
  specialRequests: [],
};
const plan = buildPlan(base);

const schemas = { parse: ParsedRequestSchema, recommend: RecommendationSchema, whatif: WhatIfCommandSchema, memo: MemoSchema };

// Only reads the saved JSON. Never calls the API.
const captures: Capture[] = JSON.parse(readFileSync(new URL("./fixtures/live-answers.json", import.meta.url), "utf8"));

function check(c: Capture): { ok: boolean; reason: string; data?: unknown } {
  let json: unknown;
  try {
    json = extractJson(c.answer);
  } catch (e) {
    return { ok: false, reason: `no JSON found: ${(e as Error).message}` };
  }
  const r = schemas[c.task].safeParse(json);
  if (!r.success) return { ok: false, reason: `schema: ${JSON.stringify(r.error.flatten())}` };
  if (c.expectedCommand) {
    const got = r.data as unknown as Record<string, unknown>;
    for (const [key, want] of Object.entries(c.expectedCommand)) {
      if (got[key] !== want) return { ok: false, reason: `meaning: expected ${key}=${String(want)}, got ${String(got[key])}` };
    }
  }
  if (c.task === "parse" && c.input.includes("same day")) {
    const day = (r.data as { departureConstraint: { day: string | null } }).departureConstraint.day;
    if (day !== "game_day") return { ok: false, reason: `meaning: expected day=game_day, got ${String(day)}` };
  }

  if (c.task === "recommend" || c.task === "memo") {
    const facts = c.task === "recommend" ? planFacts(plan) : memoFacts(plan, plan.options[1]);
    const notes: string[] = [];
    scrubDeep(r.data, allowedNumbers(facts), notes);
    if (notes.length) return { ok: false, reason: `numbers: the AI wrote numbers that are not in our facts: ${notes.join("; ")}` };
  }

  return { ok: true, reason: "", data: r.data };
}

describe("live Aivana answers", () => {
  it("has saved answers", () => {
    expect(captures.length).toBeGreaterThan(0);
  });

  it.each(captures)("$task: $input", (c) => {
    const result = check(c);
    if (c.expected === "valid") {
      expect(result.ok, result.reason).toBe(true);
    } else {
      // known-bad answers must keep failing. When the lead fixes the prompt, this
      // test goes red to tell you to flip the entry back to "valid".
      expect(result.ok, "this known-bad answer now passes: set expected to valid").toBe(false);
    }
  });
});

