import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BusType, Dataset, Hotel, HotelTier, Venue } from "@app/shared";

// The ONLY place that knows the on-disk dataset format. When the official
// dataset arrives, adapt the mapping in `loadDataset` — nothing else changes.

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8")) as T;
}

export function loadDataset(): Dataset {
  const v = readJson<Pick<Dataset, "origin" | "venues">>("venues.json");
  const h = readJson<Pick<Dataset, "hotels">>("hotels.json");
  const r = readJson<Pick<Dataset, "busTypes" | "mealRates" | "policy">>("rates.json");
  return {
    origin: v.origin,
    venues: v.venues,
    hotels: h.hotels,
    busTypes: r.busTypes,
    mealRates: r.mealRates,
    policy: r.policy,
  };
}

let cached: Dataset | null = null;
export function getDataset(): Dataset {
  return (cached ??= loadDataset());
}

export function getVenue(id: string, ds: Dataset = getDataset()): Venue | undefined {
  return ds.venues.find((v) => v.id === id);
}

export function getHotelsForVenue(venueId: string, ds: Dataset = getDataset()): Hotel[] {
  return ds.hotels.filter((h) => h.venueId === venueId);
}

export function getHotelsByTier(venueId: string, tier: HotelTier, ds: Dataset = getDataset()): Hotel[] {
  return getHotelsForVenue(venueId, ds).filter((h) => h.tier === tier);
}

export function getBusType(id: string, ds: Dataset = getDataset()): BusType | undefined {
  return ds.busTypes.find((b) => b.id === id);
}

/** Case-insensitive match of free text (e.g. "Ohio State", "OSU") to a venue. */
export function matchVenue(text: string | null | undefined, ds: Dataset = getDataset()): Venue | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase().trim();
  const word = (needle: string) =>
    new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t);
  return (
    ds.venues.find((v) => v.id === t) ??
    ds.venues.find((v) => v.school.toLowerCase() === t || v.aliases.includes(t)) ??
    ds.venues.find((v) => word(v.school.toLowerCase())) ??
    ds.venues.find((v) => v.aliases.some(word)) ??
    (t.length >= 4 ? ds.venues.find((v) => v.school.toLowerCase().includes(t)) : undefined)
  );
}
