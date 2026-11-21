import type {
  BusType,
  DepartureDay,
  Hotel,
  HotelTier,
  MealRates,
  MealSlot,
  MealTier,
  MealType,
  TravelPolicy,
} from "@app/shared";

// Pure, deterministic calculation helpers. No I/O, no AI.

export const TIERS: HotelTier[] = ["economy", "midscale", "upscale"];

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function totalTravelers(c: { players: number; coaches: number; staff: number }): number {
  return c.players + c.coaches + c.staff;
}

export function minBuses(travelers: number, capacity: number): number {
  if (travelers <= 0) return 0;
  return Math.ceil(travelers / capacity);
}

export function nightsFor(departure: DepartureDay): number {
  return departure === "two_days_before" ? 2 : departure === "day_before" ? 1 : 0;
}

/** YYYY-MM-DD date math in UTC (no timezone drift). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fromMinutes = (mins: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, mins));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Leave as late as policy allows: game day if the drive is short enough. */
export function latestFeasibleDeparture(driveHours: number, policy: TravelPolicy): DepartureDay {
  return driveHours <= policy.maxSameDayDriveHours ? "game_day" : "day_before";
}

/** Game-day departure time: kickoff − drive − arrival buffer, floored to 15 minutes. */
export function gameDayDepartureTime(gameTime: string, driveHours: number, bufferHours: number): string {
  const mins = toMinutes(gameTime) - Math.round((driveHours + bufferHours) * 60);
  return fromMinutes(Math.floor(mins / 15) * 15);
}

export function roomsNeeded(
  counts: { players: number; coaches: number; staff: number },
  occupancy: { players: number; coaches: number; staff: number },
  drivers: number,
) {
  const players = Math.ceil(counts.players / occupancy.players);
  const coaches = Math.ceil(counts.coaches / occupancy.coaches);
  const staff = Math.ceil(counts.staff / occupancy.staff);
  return { players, coaches, staff, drivers, total: players + coaches + staff + drivers };
}

export function busCost(count: number, bus: BusType, tripDays: number, roundTripMiles: number) {
  const charter = round2(count * tripDays * bus.dailyRate);
  const mileage = round2(count * roundTripMiles * bus.perMileRate);
  return { charter, mileage, total: round2(charter + mileage) };
}

export function hotelCost(rooms: number, nights: number, nightlyRate: number): number {
  return round2(rooms * nights * nightlyRate);
}

export function shiftTier(tier: HotelTier, by: number): HotelTier {
  const i = Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(tier) + by));
  return TIERS[i];
}

/**
 * Pick a hotel: cheapest in the target tier with enough rooms; otherwise the
 * nearest tier that has enough rooms; otherwise the largest-capacity hotel (flagged).
 */
export function selectHotel(
  hotels: Hotel[],
  tier: HotelTier,
  rooms: number,
): { hotel: Hotel | null; warning?: string } {
  if (hotels.length === 0) return { hotel: null, warning: "No hotels in dataset for this venue." };
  const fits = (h: Hotel) => h.roomsAvailable >= rooms;
  const byRate = (a: Hotel, b: Hotel) => a.nightlyRate - b.nightlyRate;

  const inTier = hotels.filter((h) => h.tier === tier && fits(h)).sort(byRate);
  if (inTier.length) return { hotel: inTier[0] };

  const target = TIERS.indexOf(tier);
  const others = hotels
    .filter(fits)
    .sort((a, b) => Math.abs(TIERS.indexOf(a.tier) - target) - Math.abs(TIERS.indexOf(b.tier) - target) || byRate(a, b));
  if (others.length) {
    return {
      hotel: others[0],
      warning: `No ${tier} hotel has ${rooms} rooms available; using ${others[0].name} (${others[0].tier}).`,
    };
  }
  const biggest = [...hotels].sort((a, b) => b.roomsAvailable - a.roomsAvailable)[0];
  return {
    hotel: biggest,
    warning: `No single hotel has ${rooms} rooms (largest: ${biggest.name}, ${biggest.roomsAvailable} rooms). Team would need to split hotels.`,
  };
}

/**
 * Highest-tier hotel (cheapest within tier) whose total cost fits under the cap.
 */
export function selectHotelUnderCap(
  hotels: Hotel[],
  rooms: number,
  nights: number,
  cap: number,
): Hotel | null {
  const ok = hotels
    .filter((h) => h.roomsAvailable >= rooms && hotelCost(rooms, nights, h.nightlyRate) <= cap)
    .sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier) || a.nightlyRate - b.nightlyRate);
  return ok[0] ?? null;
}

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/** Meals the department pays for, derived from the itinerary. */
export function mealSchedule(params: {
  departureDate: string;
  departureTime: string;
  gameDate: string;
  nights: number;
  travelers: number;
  tier: MealTier;
  rates: MealRates;
}): MealSlot[] {
  const { departureDate, departureTime, gameDate, nights, travelers, tier, rates } = params;
  const slots: { date: string; meal: MealType; label: string }[] = [];

  if (nights > 0) {
    const dep = toMinutes(departureTime);
    if (dep < toMinutes("11:00")) slots.push({ date: departureDate, meal: "lunch", label: "Travel lunch" });
    if (dep < toMinutes("19:00")) slots.push({ date: departureDate, meal: "dinner", label: "Team dinner" });
    for (let i = 1; i < nights; i++) {
      const d = addDays(departureDate, i);
      slots.push({ date: d, meal: "breakfast", label: "Team breakfast" });
      slots.push({ date: d, meal: "lunch", label: "Team lunch" });
      slots.push({ date: d, meal: "dinner", label: "Team dinner" });
    }
    slots.push({ date: gameDate, meal: "breakfast", label: "Team breakfast" });
  }
  slots.push({ date: gameDate, meal: "lunch", label: "Pre-game meal" });
  slots.push({ date: gameDate, meal: "dinner", label: "Post-game meal (return trip)" });

  return slots
    .sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal])
    .map((s) => {
      const perPerson = rates[tier][s.meal];
      return { ...s, travelers, perPerson, total: round2(perPerson * travelers) };
    });
}
