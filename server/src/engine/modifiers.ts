import type { DepartureDay, HotelTier, TripRequest, WhatIfCommand } from "@app/shared";

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
        if (Number.isInteger(m.amount) && (m.amount ?? 0) > 0) {
          s.playerOccupancyOverride = m.amount!;
        } else {
          s.notes.push("Player occupancy must be a positive whole number.");
        }
        break;
      case "unsupported":
        break;
    }
  }
  return s;
}
