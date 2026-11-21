import type {
  Dataset,
  DepartureDay,
  LineItem,
  MealType,
  PlanResult,
  TravelOption,
  TripRequest,
  Venue,
  WhatIfCommand,
} from "@app/shared";
import { getDataset, getHotelsForVenue, getVenue } from "../data/dataRepository.js";
import { AppError } from "../errors.js";
import {
  addDays,
  busCost,
  gameDayDepartureTime,
  hotelCost,
  latestFeasibleDeparture,
  mealSchedule,
  minBuses,
  nightsFor,
  round2,
  roomsNeeded,
  selectHotel,
  selectHotelUnderCap,
  shiftTier,
  totalTravelers,
} from "./calculator.js";
import { applyModifiers, type Scenario } from "./modifiers.js";
import { PROFILES, type Profile } from "./profiles.js";
import { buildTimeline } from "./timeline.js";

export const DISCLAIMER =
  "All costs are estimates calculated by the application from the provided travel dataset. Confirm with vendors before booking.";

const DEPARTURE_LABEL: Record<DepartureDay, string> = {
  game_day: "game day",
  day_before: "the day before",
  two_days_before: "two days before",
};

function resolveDeparture(
  profile: Profile,
  scenario: Scenario,
  venue: Venue,
  ds: Dataset,
  warnings: string[],
): DepartureDay {
  const requested = scenario.departureOverride ?? scenario.request.departure;
  let dep: DepartureDay =
    !scenario.departureOverride && profile.departureStrategy === "latest_feasible"
      ? latestFeasibleDeparture(venue.driveHours, ds.policy)
      : requested;

  if (dep === "game_day" && venue.driveHours > ds.policy.maxSameDayDriveHours) {
    warnings.push(
      `A ${venue.driveHours}h drive exceeds the ${ds.policy.maxSameDayDriveHours}h same-day policy; departing the day before instead.`,
    );
    dep = "day_before";
  }
  if (dep !== requested) {
    warnings.push(`Departs ${DEPARTURE_LABEL[dep]} (requested: ${DEPARTURE_LABEL[requested]}).`);
  }
  return dep;
}

export function buildOption(profile: Profile, scenario: Scenario, venue: Venue, ds: Dataset): TravelOption {
  const warnings: string[] = [];
  const req = scenario.request;
  const counts = { players: req.players, coaches: req.coaches, staff: req.staff };
  const travelers = totalTravelers(counts);
  const occupancy = {
  ...profile.occupancy,
  players: scenario.playerOccupancyOverride ?? profile.occupancy.players,
  };
  const gameTime = req.gameTime || ds.policy.defaultGameTime;

  // --- Departure / nights -------------------------------------------------
  const depDay = resolveDeparture(profile, scenario, venue, ds, warnings);
  const nights = nightsFor(depDay);
  const departureDate = addDays(req.gameDate, -nights);
  const departureTime =
    nights === 0
      ? gameDayDepartureTime(gameTime, venue.driveHours, ds.policy.gameDayArrivalBufferHours)
      : req.earliestDepartureTime || ds.policy.defaultDepartureTime;
  const tripDays = nights + 1;
  const roundTripMiles = venue.distanceMiles * 2;

  // --- Buses -------------------------------------------------------------
  const bus = ds.busTypes.find((b) => b.id === profile.busTypeId) ?? ds.busTypes[0];
  const required = minBuses(travelers, bus.capacity);
  let busCount = required + scenario.busDelta;
  if (busCount < required) {
    warnings.push(
      `Cannot use ${busCount} bus(es): ${travelers} travelers need at least ${required} × ${bus.capacity}-seat ${bus.name}. Kept ${required}.`,
    );
    busCount = required;
  }
  const bc = busCost(busCount, bus, tripDays, roundTripMiles);

  // --- Rooms & hotel -----------------------------------------------------
  const driverRooms = nights > 0 && ds.policy.driverRoomsRequired ? busCount : 0;
  const rooms = nights > 0 ? roomsNeeded(counts, occupancy, driverRooms) : { players: 0, coaches: 0, staff: 0, drivers: 0, total: 0 };  let hotel = null as TravelOption["hotel"];
  let hotelTotal = 0;

  if (nights > 0) {
    const venueHotels = getHotelsForVenue(venue.id, ds);
    const tier = shiftTier(scenario.tierOverride ?? profile.hotelTier, scenario.tierShift);
    const picked = selectHotel(venueHotels, tier, rooms.total);
    if (picked.warning) warnings.push(picked.warning);
    let h = picked.hotel;

    if (h && scenario.hotelBudgetCap != null && hotelCost(rooms.total, nights, h.nightlyRate) > scenario.hotelBudgetCap) {
      const capped = selectHotelUnderCap(venueHotels, rooms.total, nights, scenario.hotelBudgetCap);
      if (capped) {
        warnings.push(`Hotel budget cap applied: switched to ${capped.name} (${capped.tier}).`);
        h = capped;
      } else {
        warnings.push(`No hotel fits the hotel budget cap for ${rooms.total} rooms × ${nights} night(s); over budget.`);
      }
    }
    if (h) {
      hotel = {
        id: h.id,
        name: h.name,
        tier: h.tier,
        nightlyRate: h.nightlyRate,
        distanceToStadiumMiles: h.distanceToStadiumMiles,
        roomsAvailable: h.roomsAvailable,
      };
      hotelTotal = hotelCost(rooms.total, nights, h.nightlyRate);
    }
  }

  // --- Meals ---------------------------------------------------------------
  const meals = mealSchedule({
    departureDate,
    departureTime,
    gameDate: req.gameDate,
    nights,
    travelers,
    tier: profile.mealTier,
    rates: ds.mealRates,
  });

  // --- Line items ------------------------------------------------------------
  const lineItems: LineItem[] = [
    {
      category: "bus",
      label: `${bus.name} charter (${busCount} bus × ${tripDays} day)`,
      quantity: busCount * tripDays,
      unit: "bus-day",
      unitCost: bus.dailyRate,
      total: bc.charter,
    },
    {
      category: "bus",
      label: `Bus mileage (${busCount} bus × ${roundTripMiles} mi round trip)`,
      quantity: busCount * roundTripMiles,
      unit: "bus-mile",
      unitCost: bus.perMileRate,
      total: bc.mileage,
    },
  ];
  if (hotel) {
    lineItems.push({
      category: "hotel",
      label: `${hotel.name} (${rooms.total} rooms × ${nights} night)`,
      quantity: rooms.total * nights,
      unit: "room-night",
      unitCost: hotel.nightlyRate,
      total: hotelTotal,
    });
  }
  for (const type of ["breakfast", "lunch", "dinner"] as MealType[]) {
    const slots = meals.filter((m) => m.meal === type);
    if (!slots.length) continue;
    lineItems.push({
      category: "meals",
      label: `${type[0].toUpperCase()}${type.slice(1)} (${slots.length} × ${travelers} travelers, ${profile.mealTier})`,
      quantity: slots.length * travelers,
      unit: "meal",
      unitCost: ds.mealRates[profile.mealTier][type],
      total: round2(slots.reduce((s, m) => s + m.total, 0)),
    });
  }

  const totalCost = round2(lineItems.reduce((s, li) => s + li.total, 0));
  const departure = { day: depDay, date: departureDate, time: departureTime };
  const timeline = buildTimeline({ departure, nights, hotel, returnDate: req.gameDate }, meals, venue, req.gameDate, gameTime);

  return {
    id: profile.id,
    label: profile.label,
    description: profile.description,
    departure,
    returnDate: req.gameDate,
    nights,
    travelers: { ...counts, total: travelers },
    buses: {
      busTypeId: bus.id,
      busTypeName: bus.name,
      count: busCount,
      minRequired: required,
      capacityPerBus: bus.capacity,
      totalSeats: busCount * bus.capacity,
      amenities: bus.amenities,
    },
    hotel,
    rooms,
    meals,
    timeline,
    lineItems,
    totalCost,
    costPerTraveler: travelers ? round2(totalCost / travelers) : 0,
    warnings,
  };
}

export function validateRequest(r: TripRequest, ds: Dataset): Venue {
  const venue = getVenue(r.opponentId, ds);
  if (!venue) throw new AppError(400, "UNKNOWN_OPPONENT", `Opponent "${r.opponentId}" is not in the dataset.`);
  return venue;
}

export function buildPlan(request: TripRequest, modifiers: WhatIfCommand[] = [], ds: Dataset = getDataset()): PlanResult {
  const venue = validateRequest(request, ds);
  const scenario = applyModifiers(request, modifiers);
  const options = PROFILES.map((p) => buildOption(p, scenario, venue, ds));
  return {
    request: scenario.request,
    venue,
    origin: ds.origin,
    roundTripMiles: venue.distanceMiles * 2,
    options,
    appliedModifiers: modifiers,
    hotelBudgetCap: scenario.hotelBudgetCap,
    notes: scenario.notes,
    disclaimer: DISCLAIMER,
  };
}
