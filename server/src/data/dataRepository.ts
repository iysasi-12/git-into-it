import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BusType, Dataset, Hotel, HotelTier, Venue } from "@app/shared";

// The ONLY place that knows the on-disk dataset format. If the JSON layout
// ever changes, adapt the mapping in `loadDataset` — nothing else changes.

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf8")) as T;
}

export function loadDataset(): Dataset {
  const v = readJson<Pick<Dataset, "origin" | "venues">>("venues.json");
  const h = readJson<Pick<Dataset, "hotels">>("hotels.json");
  const r = readJson<Pick<Dataset, "busTypes" | "mealRates" | "policy">>("rates.json");
  const s = readJson<{ games: Dataset["schedule"] }>("schedule.json");
  return {
    origin: v.origin,
    venues: v.venues,
    hotels: h.hotels,
    busTypes: r.busTypes,
    mealRates: r.mealRates,
    policy: r.policy,
    schedule: s.games,
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

/**
 * The venue whose alias appears in the text, preferring the longest alias, so
 * "trip to Central Michigan" picks "central michigan" over Michigan's "michigan".
 */
function longestAliasMatch(venues: Venue[], word: (needle: string) => boolean): Venue | undefined {
  let best: { venue: Venue; length: number } | undefined;
  for (const venue of venues) {
    for (const alias of venue.aliases) {
      if (alias.length > (best?.length ?? 0) && word(alias)) best = { venue, length: alias.length };
    }
  }
  return best?.venue;
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
    longestAliasMatch(ds.venues, word) ??
    (t.length >= 4 ? ds.venues.find((v) => v.school.toLowerCase().includes(t)) : undefined)
  );
}
