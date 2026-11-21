import { describe, expect, it } from "vitest";
import type { TripRequest } from "@app/shared";
import { addDays, gameDayDepartureTime, minBuses, roomsNeeded } from "./calculator.js";
import { buildPlan } from "./optionBuilder.js";

// Hand-computed against the sample dataset in server/data.
const base: TripRequest = {
  opponentId: "ohio-state",
  gameDate: "2026-10-10",
  players: 65,
  coaches: 8,
  staff: 4,
  departure: "day_before",
  earliestDepartureTime: "14:00",
  specialRequests: [],
};

describe("calculator", () => {
  it("bus and room math", () => {
    expect(minBuses(77, 56)).toBe(2);
    expect(minBuses(56, 56)).toBe(1);
    expect(roomsNeeded({ players: 65, coaches: 8, staff: 4 }, { players: 2, coaches: 1, staff: 2 }, 2).total).toBe(45);
  });
  it("date and time math", () => {
    expect(addDays("2026-10-10", -1)).toBe("2026-10-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(gameDayDepartureTime("15:30", 2.1, 3)).toBe("10:15");
  });
});

describe("buildPlan", () => {
  const plan = buildPlan(base);
  const [A, B, C] = plan.options;

  it("Option A: game-day departure, no hotel", () => {
    expect(A.nights).toBe(0);
    expect(A.hotel).toBeNull();
    expect(A.buses.count).toBe(2);
    expect(A.departure.time).toBe("10:15");
    expect(A.totalCost).toBe(6674);
  });

  it("Option B: balanced", () => {
    expect(B.travelers.total).toBe(77);
    expect(B.rooms.total).toBe(45);
    expect(B.hotel?.id).toBe("osu-mid-1");
    expect(B.totalCost).toBe(21395);
  });

  it("Option C: comfort", () => {
    expect(C.buses.busTypeId).toBe("premium-coach");
    expect(C.rooms.total).toBe(47);
    expect(C.totalCost).toBe(30474);
  });

  it("totals always equal the sum of line items", () => {
    for (const o of plan.options) {
      const sum = o.lineItems.reduce((s, li) => s + li.total, 0);
      expect(o.totalCost).toBeCloseTo(sum, 2);
    }
  });

  it("what-if: leave 3 players home", () => {
    const p = buildPlan(base, [{ action: "adjust_players", amount: -3, explanation: "" }]);
    expect(p.options[1].travelers.total).toBe(74);
    expect(p.options[1].totalCost).toBeLessThan(B.totalCost);
  });

  it("what-if: one fewer bus is rejected when seats are insufficient", () => {
    const p = buildPlan(base, [{ action: "adjust_buses", amount: -1, explanation: "" }]);
    expect(p.options[1].buses.count).toBe(2);
    expect(p.options[1].warnings.join(" ")).toMatch(/Cannot use 1 bus/);
  });

  it("what-if: hotel budget cap picks best hotel under cap", () => {
    const p = buildPlan(base, [{ action: "set_hotel_budget_cap", amount: 7000, explanation: "" }]);
    expect(p.options[1].hotel?.id).toBe("osu-econ-2");
    const tooLow = buildPlan(base, [{ action: "set_hotel_budget_cap", amount: 4000, explanation: "" }]);
    expect(tooLow.options[1].warnings.join(" ")).toMatch(/over budget/);
  });

  it("what-if: upgrade hotel shifts tier", () => {
    const p = buildPlan(base, [{ action: "shift_hotel_tier", amount: 1, explanation: "" }]);
    expect(p.options[1].hotel?.tier).toBe("upscale");
  });

  it("long drives force an overnight even for Option A", () => {
    const p = buildPlan({ ...base, opponentId: "penn-state" });
    expect(p.options[0].nights).toBe(1);
  });
});

describe("D3 edge cases", () => {
  it("56 travelers fit on one standard bus (Option B)", () => {
    const p = buildPlan({ ...base, players: 50, coaches: 4, staff: 2 });
    expect(p.options[1].travelers.total).toBe(56);
    expect(p.options[1].buses.count).toBe(1);
  });

  it("56 travelers need 2 premium buses (Option C seats 50)", () => {
    const p = buildPlan({ ...base, players: 50, coaches: 4, staff: 2 });
    expect(p.options[2].buses.count).toBe(2);
  });

  it("57 travelers need 2 standard buses (Option B)", () => {
    const p = buildPlan({ ...base, players: 51, coaches: 4, staff: 2 });
    expect(p.options[1].travelers.total).toBe(57);
    expect(p.options[1].buses.count).toBe(2);
  });

  it("zero staff: no staff rooms, nothing crashes", () => {
    const p = buildPlan({ ...base, staff: 0 });
    const B = p.options[1];
    expect(B.travelers.total).toBe(73);
    expect(B.rooms.staff).toBe(0);
    expect(B.rooms.total).toBe(43); // 33 players + 8 coaches + 0 staff + 2 drivers
  });

  it("two nights before: 2 nights and the right meal total", () => {
    const p = buildPlan({ ...base, departure: "two_days_before" });
    const B = p.options[1];
    expect(B.nights).toBe(2);
    const meals = B.lineItems
      .filter((li) => li.category === "meals")
      .reduce((s, li) => s + li.total, 0);
    expect(meals).toBe(12320); // verify by hand, see note below
  });

  it("budget cap nothing fits under warns about over budget", () => {
    const p = buildPlan(base, [{ action: "set_hotel_budget_cap", amount: 100, explanation: "" }]);
    expect(p.options[1].warnings.join(" ")).toMatch(/over budget/);
  });
});

describe("D3 extra boundaries", () => {
  it("zero coaches: no coach rooms, nothing crashes", () => {
    const p = buildPlan({ ...base, coaches: 0 });
    const B = p.options[1];
    expect(B.travelers.total).toBe(69);
    expect(B.buses.count).toBe(2);
    expect(B.rooms.total).toBe(37); // 33 players + 0 coaches + 2 staff + 2 drivers
  });

  it("zero players: still builds a plan", () => {
    const p = buildPlan({ ...base, players: 0 });
    const B = p.options[1];
    expect(B.travelers.total).toBe(12);
    expect(B.buses.count).toBe(1);
    expect(B.rooms.total).toBe(11); // 0 players + 8 coaches + 2 staff + 1 driver
  });

  it("one traveler: 1 bus, 2 rooms", () => {
    const p = buildPlan({ ...base, players: 1, coaches: 0, staff: 0 });
    const B = p.options[1];
    expect(B.travelers.total).toBe(1);
    expect(B.buses.count).toBe(1);
    expect(B.rooms.total).toBe(2); // 1 player room + 1 driver
  });
});