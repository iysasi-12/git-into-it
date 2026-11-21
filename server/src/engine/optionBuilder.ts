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
  weekday,
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

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const perRoom = (occupancy: number) => (occupancy === 1 ? "in single rooms" : `at ${occupancy} per room, rounded up`);
const FROM_DATA = "from the dataset";

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
  const rooms = 
    nights > 0 
      ? roomsNeeded(counts, occupancy, driverRooms) 
      : { players: 0, coaches: 0, staff: 0, drivers: 0, total: 0 };  
    
  let hotel = null as TravelOption["hotel"];
  let hotelTotal = 0;
  let hotelChoice = "";

  if (nights > 0) {
    const venueHotels = getHotelsForVenue(venue.id, ds);
    const tier = shiftTier(scenario.tierOverride ?? profile.hotelTier, scenario.tierShift);
    const picked = selectHotel(venueHotels, tier, rooms.total);
    if (picked.warning) warnings.push(picked.warning);
    let h = picked.hotel;
    hotelChoice = picked.warning ?? `Hotel: cheapest ${tier} hotel for this game with at least ${rooms.total} rooms available.`;

    if (h && scenario.hotelBudgetCap != null && hotelCost(rooms.total, nights, h.nightlyRate) > scenario.hotelBudgetCap) {
      const capped = selectHotelUnderCap(venueHotels, rooms.total, nights, scenario.hotelBudgetCap);
      const cap = `$${scenario.hotelBudgetCap.toLocaleString("en-US")}`;
      if (capped) {
        warnings.push(`Hotel budget cap applied: switched to ${capped.name} (${capped.tier}).`);
        h = capped;
        hotelChoice = `Hotel: ${cap} budget cap (what-if), so the highest-tier hotel whose ${rooms.total} rooms × ${n(nights, "night")} fit under it.`;
      } else {
        hotelChoice += ` No hotel fits the ${cap} budget cap.`;
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

  // --- Line items (each carries the factors and rules behind its total) ----
  const whoTravels = `${req.players} players + ${req.coaches} coaches + ${req.staff} staff`;
  const extraBuses = busCount - required;
  const busesFactor = {
    value: busCount,
    unit: busCount === 1 ? "bus" : "buses",
    source:
      `${travelers} travelers ÷ ${bus.capacity} seats per ${bus.name}, rounded up = ${required}` +
      (extraBuses ? `, ${extraBuses > 0 ? "+" : ""}${extraBuses} from what-if` : ""),
  };
  const busRule = `Buses: ${travelers} travelers (${whoTravels}) need ${n(required, "bus", "buses")} of ${bus.capacity} seats.`;

  const lineItems: LineItem[] = [
    {
      category: "bus",
      label: `${bus.name} charter (${busCount} bus × ${tripDays} day)`,
      quantity: busCount * tripDays,
      unit: "bus-day",
      unitCost: bus.dailyRate,
      total: bc.charter,
      basis: {
        factors: [
          busesFactor,
          {
            value: tripDays,
            unit: tripDays === 1 ? "day" : "days",
            source: nights === 0 ? "Same-day trip" : `${n(nights, "night")} away + game day`,
          },
          { value: bus.dailyRate, unit: "bus-day", money: true, source: `${bus.name} daily rate, ${FROM_DATA}` },
        ],
        rules: [busRule, "Charter is billed per bus for each calendar day of the trip."],
      },
    },
    {
      category: "bus",
      label: `Bus mileage (${busCount} bus × ${roundTripMiles} mi round trip)`,
      quantity: busCount * roundTripMiles,
      unit: "bus-mile",
      unitCost: bus.perMileRate,
      total: bc.mileage,
      basis: {
        factors: [
          busesFactor,
          {
            value: roundTripMiles,
            unit: "mi round trip",
            source: `2 × ${venue.distanceMiles} mi one-way to ${venue.city}, ${venue.state}, ${FROM_DATA}`,
          },
          { value: bus.perMileRate, unit: "bus-mile", money: true, source: `${bus.name} per-mile rate, ${FROM_DATA}` },
        ],
        rules: [busRule, "Mileage is billed per bus for the full round trip."],
      },
    },
  ];
  if (hotel) {
    const roomParts = [
      `${rooms.players} for players`,
      `${rooms.coaches} for coaches`,
      `${rooms.staff} for staff`,
      ...(rooms.drivers ? [`${rooms.drivers} for drivers`] : []),
    ];
    const groupRule = (label: string, people: number, occ: number, count: number) =>
      `${label}: ${people} ${perRoom(occ)} = ${n(count, "room")}.`;
    lineItems.push({
      category: "hotel",
      label: `${hotel.name} (${rooms.total} rooms × ${nights} night)`,
      quantity: rooms.total * nights,
      unit: "room-night",
      unitCost: hotel.nightlyRate,
      total: hotelTotal,
      basis: {
        factors: [
          { value: rooms.total, unit: "rooms", source: roomParts.join(" + ") },
          {
            value: nights,
            unit: nights === 1 ? "night" : "nights",
            source: `Departs ${DEPARTURE_LABEL[depDay]} (${weekday(departureDate)}), returns after the game`,
          },
          {
            value: hotel.nightlyRate,
            unit: "room-night",
            money: true,
            source: `${hotel.name} (${hotel.tier}) nightly rate, ${FROM_DATA}`,
          },
        ],
        rules: [
          ...(req.players ? [groupRule("Players", req.players, occupancy.players, rooms.players)] : []),
          ...(req.coaches ? [groupRule("Coaches", req.coaches, occupancy.coaches, rooms.coaches)] : []),
          ...(req.staff ? [groupRule("Staff", req.staff, occupancy.staff, rooms.staff)] : []),
          ...(rooms.drivers
            ? [`Bus drivers: 1 room per driver (${n(busCount, "bus", "buses")}) = ${n(rooms.drivers, "room")}.`]
            : []),
          hotelChoice,
        ],
      },
    });
  }
  for (const type of ["breakfast", "lunch", "dinner"] as MealType[]) {
    const slots = meals.filter((m) => m.meal === type);
    if (!slots.length) continue;
    const rate = ds.mealRates[profile.mealTier][type];
    lineItems.push({
      category: "meals",
      label: `${type[0].toUpperCase()}${type.slice(1)} (${slots.length} × ${travelers} travelers, ${profile.mealTier})`,
      quantity: slots.length * travelers,
      unit: "meal",
      unitCost: rate,
      total: round2(slots.reduce((s, m) => s + m.total, 0)),
      basis: {
        factors: [
          {
            value: slots.length,
            unit: slots.length === 1 ? type : `${type}s`,
            source: slots.map((m) => `${weekday(m.date).slice(0, 3)}: ${m.label}`).join(" · "),
          },
          { value: travelers, unit: "travelers", source: whoTravels },
          { value: rate, unit: "person", money: true, source: `${profile.mealTier} ${type} rate, ${FROM_DATA}` },
        ],
        rules: [
          "Every traveler is covered for each team meal on the itinerary.",
          ...(nights > 0 && type !== "breakfast"
            ? ["Departure day: lunch if the bus leaves before 11:00 AM, dinner if it leaves before 7:00 PM."]
            : []),
        ],
      },
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
