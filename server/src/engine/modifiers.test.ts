import { describe, expect, it } from "vitest";
import type { TripRequest } from "@app/shared";
import { noChangeReason, whatIfEffect } from "./modifiers.js";
import { buildPlan } from "./optionBuilder.js";

// Hand-derived: 65 + 8 + 4 = 77 travelers. A and B ride 56-seat Standard Motorcoaches,
// C rides 50-seat Premium Team Coaches; ceil(77/56) = ceil(77/50) = 2 buses for every option.
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

describe("whatIfEffect", () => {
  const before = buildPlan(base);

  it("reports no change when every option still needs all its buses", () => {
    const after = buildPlan(base, [{ action: "adjust_buses", amount: -1, explanation: "Use one fewer bus." }]);
    const effect = whatIfEffect(before, after);
    expect(effect.changed).toBe(false);
    expect(effect.newWarnings).toEqual([
      "Cannot use 1 bus(es): 77 travelers need at least 2 × 56-seat Standard Motorcoach. Kept 2.",
      "Cannot use 1 bus(es): 77 travelers need at least 2 × 50-seat Premium Team Coach. Kept 2.",
    ]);
  });

  it("reports a change when the headcount drops", () => {
    const after = buildPlan(base, [{ action: "adjust_players", amount: -3, explanation: "Leave 3 players home." }]);
    expect(whatIfEffect(before, after).changed).toBe(true);
  });

  it("treats identical plans as unchanged", () => {
    expect(whatIfEffect(before, buildPlan(base))).toEqual({ changed: false, newWarnings: [] });
  });
});

describe("noChangeReason", () => {
  // Hand-derived from the sample data: under a $7,000 cap every option already gets the best
  // hotel that fits (economy), so an upgrade can't change anything.
  const cap = { action: "set_hotel_budget_cap", amount: 7000, explanation: "Cap the hotel budget at $7,000." } as const;
  const upgrade = { action: "shift_hotel_tier", amount: 1, explanation: "Upgrade hotel quality." } as const;

  it("names the hotel cap when it blocks a hotel-quality change", () => {
    const before = buildPlan(base, [cap]);
    expect(whatIfEffect(before, buildPlan(base, [cap, upgrade])).changed).toBe(false);
    expect(noChangeReason(upgrade, before)).toBe(
      "With the $7,000 hotel budget cap in place, each option already has the best hotel that fits under it. Remove the cap to change hotel quality.",
    );
  });

  it("falls back to a general reason otherwise", () => {
    expect(noChangeReason(upgrade, buildPlan(base))).toBe("It wouldn't change any option's buses, hotel or cost.");
  });
});
