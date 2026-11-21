import type { HotelTier, MealTier, OptionId } from "@app/shared";

/**
 * Option policies. These are knobs only — every rate/price comes from the dataset.
 */
export interface Profile {
  id: OptionId;
  label: string;
  description: string;
  hotelTier: HotelTier;
  /** People per room by group. */
  occupancy: { players: number; coaches: number; staff: number };
  mealTier: MealTier;
  busTypeId: string;
  /** latest_feasible = leave as late as policy allows (fewest hotel nights). */
  departureStrategy: "latest_feasible" | "requested";
}

export const PROFILES: Profile[] = [
  {
    id: "A",
    label: "Lowest Cost",
    description: "Economy hotel, double rooms for everyone, latest feasible departure, economy meal rates.",
    hotelTier: "economy",
    occupancy: { players: 2, coaches: 2, staff: 2 },
    mealTier: "economy",
    busTypeId: "standard-coach",
    departureStrategy: "latest_feasible",
  },
  {
    id: "B",
    label: "Balanced",
    description: "Midscale hotel, single rooms for coaches, departs as requested, standard meal rates.",
    hotelTier: "midscale",
    occupancy: { players: 2, coaches: 1, staff: 2 },
    mealTier: "standard",
    busTypeId: "standard-coach",
    departureStrategy: "requested",
  },
  {
    id: "C",
    label: "Comfort",
    description: "Upscale hotel, single rooms for coaches and staff, premium coaches, premium meals.",
    hotelTier: "upscale",
    occupancy: { players: 2, coaches: 1, staff: 1 },
    mealTier: "premium",
    busTypeId: "premium-coach",
    departureStrategy: "requested",
  },
];
