import type { DepartureDay, HotelTier, PlanResult, TravelOption, TripRequest, WhatIfCommand } from "@app/shared";

/** Effective scenario after replaying all what-if commands over the base request. */
export interface Scenario {
  request: TripRequest;
  busDelta: number;
  hotelBudgetCap: number | null;
  tierShift: number;
  tierOverride: HotelTier | null;
  departureOverride: DepartureDay | null;
  playerOccupancyOverride: number | null;
  notes: string[];
}

export function applyModifiers(base: TripRequest, modifiers: WhatIfCommand[] = []): Scenario {
  const s: Scenario = {
    request: { ...base, specialRequests: [...(base.specialRequests ?? [])] },
    busDelta: 0,
    hotelBudgetCap: null,
    tierShift: 0,
    tierOverride: null,
    departureOverride: null,
    playerOccupancyOverride: null,
    notes: [],
  };
  const r = s.request;
  const int = (n: number | undefined) => Math.trunc(n ?? 0);

  for (const m of modifiers) {
    switch (m.action) {
      case "adjust_players":
        r.players = Math.max(1, r.players + int(m.amount));
        break;
      case "adjust_coaches":
        r.coaches = Math.max(0, r.coaches + int(m.amount));
        break;
      case "adjust_staff":
        r.staff = Math.max(0, r.staff + int(m.amount));
        break;
      case "adjust_buses":
        s.busDelta += int(m.amount);
        break;
      case "set_hotel_budget_cap":
        s.hotelBudgetCap = m.amount && m.amount > 0 ? m.amount : null;
        break;
      case "set_hotel_tier":
        if (m.tier) {
          s.tierOverride = m.tier;
          s.tierShift = 0;
        }
        break;
      case "shift_hotel_tier":
        s.tierShift += int(m.amount);
        break;
      case "set_departure":
        if (m.departure) s.departureOverride = m.departure;
        break;
      case "set_player_occupancy":
        if (Number.isInteger(m.amount) && (m.amount ?? 0) >= 1 && (m.amount ?? 0) <= 4) {
          s.playerOccupancyOverride = m.amount!;
        } else {
          s.notes.push("Player occupancy must be a whole number from 1 to 4.");
        }
        break;
      case "unsupported":
        break;
    }
  }
  return s;
}

/** What a booking would actually differ on: cost, headcount, buses, rooms, hotel, departure. */
const outcomeKey = (o: TravelOption) =>
  JSON.stringify([o.totalCost, o.travelers.total, o.buses.count, o.buses.busTypeName, o.rooms.total, o.nights, o.hotel?.name ?? null, o.departure]);

/**
 * Did a what-if change anything? The engine never refuses a modifier outright; it keeps
 * what is feasible and adds a warning (e.g. "Cannot use 1 bus(es) … Kept 2."). So compare
 * the plans: if no option changed, the what-if had no effect, and the new warnings say why.
 */
export function whatIfEffect(before: PlanResult, after: PlanResult): { changed: boolean; newWarnings: string[] } {
  const changed = after.options.some((o) => {
    const prev = before.options.find((p) => p.id === o.id);
    return !prev || outcomeKey(prev) !== outcomeKey(o);
  });
  const old = new Set(before.options.flatMap((o) => o.warnings));
  const newWarnings = [...new Set(after.options.flatMap((o) => o.warnings).filter((w) => !old.has(w)))];
  return { changed, newWarnings };
}

/**
 * Why a supported what-if changed nothing, for when the engine added no warning that says so.
 * Built from engine state only (the cap is the user's own number), never from AI text.
 */
export function noChangeReason(command: WhatIfCommand, before: PlanResult): string {
  const hotelChange = command.action === "shift_hotel_tier" || command.action === "set_hotel_tier";
  if (hotelChange && before.hotelBudgetCap != null) {
    const cap = `$${before.hotelBudgetCap.toLocaleString("en-US")}`;
    return `With the ${cap} hotel budget cap in place, each option already has the best hotel that fits under it. Remove the cap to change hotel quality.`;
  }
  return "It wouldn't change any option's buses, hotel or cost.";
}
