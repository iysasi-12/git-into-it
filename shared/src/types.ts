// Single source of truth for types shared by server and client.
// Type-only module: always import with `import type`.

export type OptionId = "A" | "B" | "C";
export type HotelTier = "economy" | "midscale" | "upscale";
export type MealTier = "economy" | "standard" | "premium";
export type MealType = "breakfast" | "lunch" | "dinner";
/** When the team leaves, relative to game day. */
export type DepartureDay = "game_day" | "day_before" | "two_days_before";

// ---------------------------------------------------------------------------
// Dataset (loaded from server/data/*.json — the ONLY source of prices/distances)
// ---------------------------------------------------------------------------

export interface Origin {
  name: string;
  city: string;
  state: string;
}

export interface Venue {
  id: string;
  school: string;
  mascot: string;
  stadium: string;
  city: string;
  state: string;
  /** One-way road miles from origin. */
  distanceMiles: number;
  /** One-way drive time in hours from origin. */
  driveHours: number;
  /** Alternate names used to match free text ("OSU", "Buckeyes"). */
  aliases: string[];
}

export interface Hotel {
  id: string;
  venueId: string;
  name: string;
  tier: HotelTier;
  nightlyRate: number;
  roomsAvailable: number;
  distanceToStadiumMiles: number;
}

export interface BusType {
  id: string;
  name: string;
  capacity: number;
  dailyRate: number;
  perMileRate: number;
  amenities: string[];
}

export type MealRates = Record<MealTier, Record<MealType, number>>;

export interface TravelPolicy {
  /** Above this one-way drive time, the team must leave at least the day before. */
  maxSameDayDriveHours: number;
  /** Bus drivers need their own hotel rooms on overnight trips. */
  driverRoomsRequired: boolean;
  /** Hours the team wants to arrive before kickoff on a game-day departure. */
  gameDayArrivalBufferHours: number;
  defaultGameTime: string; // HH:MM
  defaultDepartureTime: string; // HH:MM
}

export interface Dataset {
  origin: Origin;
  venues: Venue[];
  hotels: Hotel[];
  busTypes: BusType[];
  mealRates: MealRates;
  policy: TravelPolicy;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface TripRequest {
  opponentId: string; // Venue.id
  gameDate: string; // YYYY-MM-DD
  gameTime?: string; // HH:MM (defaults to policy.defaultGameTime)
  players: number;
  coaches: number;
  staff: number;
  departure: DepartureDay;
  earliestDepartureTime?: string; // HH:MM, e.g. "14:00" for "after classes"
  specialRequests: string[];
}

export interface ParseResponse {
  /** Fields the AI could extract; the user confirms them in the form. */
  request: Partial<TripRequest>;
  missingFields: (keyof TripRequest)[];
  /** Opponent text that did not match any venue in the dataset. */
  unmatchedOpponent?: string;
  source: AiSource;
}

// ---------------------------------------------------------------------------
// What-if modifications (produced by AI, applied by app code)
// ---------------------------------------------------------------------------

export type WhatIfAction =
  | "adjust_players"
  | "adjust_coaches"
  | "adjust_staff"
  | "set_hotel_budget_cap"
  | "adjust_buses"
  | "set_hotel_tier"
  | "shift_hotel_tier"
  | "set_departure"
  | "unsupported";

export interface WhatIfCommand {
  action: WhatIfAction;
  /** Signed delta for adjust_* / shift_hotel_tier; dollar cap (user-supplied) for set_hotel_budget_cap. */
  amount?: number;
  tier?: HotelTier;
  departure?: DepartureDay;
  /** Short human-readable restatement of the command. */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Calculated plan (100% app-computed)
// ---------------------------------------------------------------------------

export interface LineItem {
  category: "bus" | "hotel" | "meals";
  label: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface MealSlot {
  date: string;
  meal: MealType;
  label: string; // e.g. "Pre-game meal"
  travelers: number;
  perPerson: number;
  total: number;
}

export interface TimelineEvent {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  event: string;
}

export interface TravelOption {
  id: OptionId;
  label: string;
  description: string;
  departure: { day: DepartureDay; date: string; time: string };
  returnDate: string;
  nights: number;
  travelers: { players: number; coaches: number; staff: number; total: number };
  buses: {
    busTypeId: string;
    busTypeName: string;
    count: number;
    minRequired: number;
    capacityPerBus: number;
    totalSeats: number;
    amenities: string[];
  };
  hotel: {
    id: string;
    name: string;
    tier: HotelTier;
    nightlyRate: number;
    distanceToStadiumMiles: number;
    roomsAvailable: number;
  } | null;
  rooms: { players: number; coaches: number; staff: number; drivers: number; total: number };
  meals: MealSlot[];
  /** App-computed schedule (times derived from dataset drive times + policy). */
  timeline: TimelineEvent[];
  lineItems: LineItem[];
  totalCost: number;
  costPerTraveler: number;
  warnings: string[];
}

export interface PlanResult {
  request: TripRequest; // effective request after modifiers
  venue: Venue;
  origin: Origin;
  roundTripMiles: number;
  options: TravelOption[];
  appliedModifiers: WhatIfCommand[];
  hotelBudgetCap: number | null;
  notes: string[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// AI outputs
// ---------------------------------------------------------------------------

export type AiSource = "ai" | "mock" | "fallback";

export interface Tradeoff {
  optionId: OptionId;
  pros: string[];
  cons: string[];
}

export interface Recommendation {
  recommendedOptionId: OptionId;
  reasoning: string;
  tradeoffs: Tradeoff[];
  source: AiSource;
  /** Notes from the guardrail layer (e.g. stripped invented numbers). */
  guardNotes: string[];
}

export interface TravelMemo {
  title: string;
  summary: string;
  itinerary: { day: string; time: string; activity: string }[];
  departureReminders: string[];
  mealSchedule: { day: string; meal: string; note: string }[];
  source: AiSource;
  guardNotes: string[];
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export interface PlanRequestBody {
  request: TripRequest;
  modifiers?: WhatIfCommand[];
}

export interface PlanResponse {
  plan: PlanResult;
  recommendation: Recommendation;
}

export interface WhatIfRequestBody {
  request: TripRequest;
  modifiers: WhatIfCommand[];
  message: string;
}

export interface WhatIfResponse extends PlanResponse {
  command: WhatIfCommand;
  modifiers: WhatIfCommand[];
  /** Explanation of what was applied, or why nothing changed. */
  note: string;
  source: AiSource;
}

export interface MemoRequestBody {
  request: TripRequest;
  modifiers: WhatIfCommand[];
  optionId: OptionId;
}

export interface MemoResponse {
  memo: TravelMemo;
  option: TravelOption;
  plan: PlanResult;
}

export interface OpponentSummary {
  id: string;
  school: string;
  city: string;
  state: string;
  distanceMiles: number;
  driveHours: number;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
