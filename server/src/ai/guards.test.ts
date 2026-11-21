import { describe, expect, it } from "vitest";
import { allowedNumbers, canonicalEnum, extractJson, scrubText } from "./guards.js";
import { heuristicWhatIf } from "./heuristics.js";
import { ParsedRequestSchema, WhatIfCommandSchema } from "./schemas.js";

describe("enum spelling repair", () => {
  const actions = ["adjust_players", "adjust_buses", "unsupported"];

  it("maps near-miss spellings onto the one allowed value", () => {
    expect(canonicalEnum("adjustplayers", actions)).toBe("adjust_players");
    expect(canonicalEnum("Adjust Buses", actions)).toBe("adjust_buses");
    expect(canonicalEnum("two-days-before", ["day_before", "two_days_before"])).toBe("two_days_before");
  });

  it("leaves unknown, ambiguous and non-string values alone", () => {
    expect(canonicalEnum("teleport", actions)).toBe("teleport");
    expect(canonicalEnum("ab", ["a_b", "a-b"])).toBe("ab");
    expect(canonicalEnum(-3, actions)).toBe(-3);
    expect(canonicalEnum(null, actions)).toBe(null);
  });

  // Exact answers captured from live Aivana on 2026-11-21.
  it("accepts the live what-if answer and keeps its numbers untouched", () => {
    const live = { action: "adjustplayers", amount: -3, tier: null, departure: null, explanation: "Leave 3 players home." };
    expect(WhatIfCommandSchema.parse(live)).toMatchObject({ action: "adjust_players", amount: -3 });
  });

  it("accepts the live parse answer's departure day", () => {
    const live = {
      opponent: "Ohio State University", gameDate: "2027-10-10", players: 65, coaches: 8, staff: 4,
      departureConstraint: { day: "daybefore", earliestTime: null, note: "Leave Friday after classes." },
      specialRequests: ["We need a vegetarian option at team meals."],
    };
    expect(ParsedRequestSchema.parse(live).departureConstraint.day).toBe("day_before");
  });

  it("still rejects actions that are not in the list", () => {
    expect(WhatIfCommandSchema.safeParse({ action: "teleport_team", explanation: "x" }).success).toBe(false);
  });
});

describe("guards", () => {
  const facts = { options: [{ id: "A", totalCost: 6674 }, { id: "B", totalCost: 21395 }], comparisons: [{ costDifference: 14721 }] };
  const allowed = allowedNumbers(facts);

  it("keeps numbers that come from app facts", () => {
    const notes: string[] = [];
    expect(scrubText("Option B costs $21,395, which is $14,721 more.", allowed, notes)).toBe(
      "Option B costs $21,395, which is $14,721 more.",
    );
    expect(notes).toHaveLength(0);
  });

  it("strips invented figures", () => {
    const notes: string[] = [];
    const out = scrubText("Option C would cost about $9,999 and the drive is 140 miles.", allowed, notes);
    expect(out).not.toMatch(/9,999|140/);
    expect(notes).toHaveLength(2);
  });

  it("extracts JSON from fenced answers", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe("what-if heuristics", () => {
  it.each([
    ["Leave 3 players home", { action: "adjust_players", amount: -3 }],
    ["Cap hotel budget at $4000", { action: "set_hotel_budget_cap", amount: 4000 }],
    ["Use one fewer bus", { action: "adjust_buses", amount: -1 }],
    ["Upgrade hotel quality", { action: "shift_hotel_tier", amount: 1 }],
    ["Bring 2 more coaches", { action: "adjust_coaches", amount: 2 }],
    ["Drop 5 guys from the roster", { action: "adjust_players", amount: -5 }],
    ["Lose two assistant coaches", { action: "adjust_coaches", amount: -2 }],
    ["What if we add a trainer", { action: "adjust_staff", amount: 1 }],
    ["Add an equipment manager", { action: "adjust_staff", amount: 1 }],
    ["We can only spend 6k on hotels", { action: "set_hotel_budget_cap", amount: 6000 }],
    ["Send 4 players home", { action: "adjust_players", amount: -4 }],
    ["Take two fewer staff", { action: "adjust_staff", amount: -2 }],
    ["Add one more bus", { action: "adjust_buses", amount: 1 }],
    ["Switch to a cheaper hotel", { action: "shift_hotel_tier", amount: -1 }],
    ["Let's leave Thursday instead", { action: "set_departure", departure: "two_days_before" }],
    ["Send 2 more coaches", { action: "adjust_coaches", amount: 2 }],
    ["Send two extra buses", { action: "adjust_buses", amount: 2 }],
    ["Put only 3 players per room", { action: "unsupported" }],

  ])("%s", (msg, expected) => {
    expect(heuristicWhatIf(msg)).toMatchObject(expected);
  });
});
