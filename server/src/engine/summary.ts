import type { OptionId, PlanResult, TravelOption } from "@app/shared";
import { round2, weekday } from "./calculator.js";
import { dayLabel, usDate, usTime } from "./displayFormat.js";

// Compact, app-computed fact sheets handed to the AI. Every number the AI is
// allowed to mention must appear here (including pre-computed differences).

export function optionFacts(o: TravelOption) {
  return {
    id: o.id,
    label: o.label,
    totalCost: o.totalCost,
    costPerTraveler: o.costPerTraveler,
    departure: { ...o.departure, weekday: weekday(o.departure.date) },
    nights: o.nights,
    travelers: o.travelers.total,
    buses: { count: o.buses.count, type: o.buses.busTypeName, seatsPerBus: o.buses.capacityPerBus, amenities: o.buses.amenities },
    hotel: o.hotel
      ? { name: o.hotel.name, tier: o.hotel.tier, nightlyRate: o.hotel.nightlyRate, milesToStadium: o.hotel.distanceToStadiumMiles }
      : null,
    rooms: o.rooms.total,
    costByCategory: {
      bus: round2(o.lineItems.filter((l) => l.category === "bus").reduce((s, l) => s + l.total, 0)),
      hotel: round2(o.lineItems.filter((l) => l.category === "hotel").reduce((s, l) => s + l.total, 0)),
      meals: round2(o.lineItems.filter((l) => l.category === "meals").reduce((s, l) => s + l.total, 0)),
    },
    warnings: o.warnings,
  };
}

export function comparisons(options: TravelOption[]) {
  const out: { from: OptionId; to: OptionId; costDifference: number; percentDifference: number }[] = [];
  for (const a of options)
    for (const b of options) {
      if (a.id >= b.id) continue;
      const diff = round2(b.totalCost - a.totalCost);
      out.push({ from: a.id, to: b.id, costDifference: diff, percentDifference: a.totalCost ? Math.round((diff / a.totalCost) * 100) : 0 });
    }
  return out;
}

export function planFacts(plan: PlanResult) {
  return {
    trip: {
      opponent: plan.venue.school,
      city: `${plan.venue.city}, ${plan.venue.state}`,
      gameDate: plan.request.gameDate,
      gameWeekday: weekday(plan.request.gameDate),
      oneWayMiles: plan.venue.distanceMiles,
      driveHours: plan.venue.driveHours,
      players: plan.request.players,
      coaches: plan.request.coaches,
      staff: plan.request.staff,
      requestedDeparture: plan.request.departure,
      specialRequests: plan.request.specialRequests,
      hotelBudgetCap: plan.hotelBudgetCap,
      whatIfsApplied: plan.appliedModifiers.map((m) => m.explanation),
    },
    options: plan.options.map(optionFacts),
    comparisons: comparisons(plan.options),
  };
}

export function memoFacts(plan: PlanResult, option: TravelOption) {
  return {
    trip: planFacts(plan).trip,
    stadium: plan.venue.stadium,
    gameTime: plan.request.gameTime,
    gameDateDisplay: usDate(plan.request.gameDate),
    chosenOption: optionFacts(option),
    // `day` / `displayTime` are the formats people see (MM/DD/YYYY, 12-hour Eastern).
    timeline: option.timeline.map((e) => ({ ...e, weekday: weekday(e.date), day: dayLabel(e.date), displayTime: usTime(e.time) })),
    meals: option.meals.map((m) => ({ date: m.date, weekday: weekday(m.date), day: dayLabel(m.date), meal: m.meal, label: m.label })),
  };
}
