import { z } from "zod";
import { loadDataset } from "./dataRepository.js";
import { PROFILES } from "../engine/profiles.js";

const VenueSchema = z.object({
  id: z.string().min(1),
  school: z.string().min(1),
  mascot: z.string().min(1),
  stadium: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  distanceMiles: z.number().positive(),
  driveHours: z.number().positive(),
  aliases: z.array(z.string().min(1)),
  timeZone: z.enum(["ET", "CT"]).optional(),
});

const HotelSchema = z.object({
  id: z.string().min(1),
  venueId: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(["economy", "midscale", "upscale"]),
  nightlyRate: z.number().positive(),
  roomsAvailable: z.number().int().positive(),
  distanceToStadiumMiles: z.number().positive(),
});

const ScheduledGameSchema = z.object({
  opponentId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gameTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

const BusTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().positive(),
  dailyRate: z.number().positive(),
  perMileRate: z.number().positive(),
  amenities: z.array(z.string()),
});



const errors: string[] = [];
const ds = loadDataset();

// 1. Shape checks: does every record match its schema?
ds.venues.forEach((v, i) => {
  const r = VenueSchema.safeParse(v);
  if (!r.success) errors.push(`venues[${i}] (${v.id}): ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(", ")}`);
});

ds.hotels.forEach((h, i) => {
  const r = HotelSchema.safeParse(h);
  if (!r.success) errors.push(`hotels[${i}] (${h.id}): ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(", ")}`);
});

ds.busTypes.forEach((b, i) => {
  const r = BusTypeSchema.safeParse(b);
  if (!r.success) errors.push(`busTypes[${i}] (${b.id}): ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(", ")}`);
});

// duplicate ids
const dupes = (label: string, ids: string[]) => {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate ${label} id: ${id}`);
    seen.add(id);
  }
};
dupes("venue", ds.venues.map((v) => v.id));
dupes("hotel", ds.hotels.map((h) => h.id));

dupes("bus type", ds.busTypes.map((b) => b.id));

const busIds = new Set(ds.busTypes.map((b) => b.id));
for (const required of ["standard-coach", "premium-coach"]) {
  if (!busIds.has(required)) {
    errors.push(`bus type "${required}" is used by engine/profiles.ts but missing from busTypes`);
  }
}

// every hotel points at a real venue
const venueIds = new Set(ds.venues.map((v) => v.id));
for (const h of ds.hotels) {
  if (!venueIds.has(h.venueId)) {
    errors.push(`hotel ${h.id}: venueId "${h.venueId}" not found in venues`);
  }
}

// every scheduled game is well-formed and points at a real venue
ds.schedule.forEach((g, i) => {
  const r = ScheduledGameSchema.safeParse(g);
  if (!r.success) errors.push(`schedule[${i}]: ${r.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join(", ")}`);
  if (!venueIds.has(g.opponentId)) errors.push(`schedule[${i}]: opponentId "${g.opponentId}" not found in venues`);
});

const warnings: string[] = [];
for (const v of ds.venues) {
  for (const tier of ["economy", "midscale", "upscale"] as const) {
    if (!ds.hotels.some((h) => h.venueId === v.id && h.tier === tier)) {
      warnings.push(`venue ${v.id}: no ${tier} hotel`);
    }
  }
}
if (warnings.length) console.warn(`⚠️ ${warnings.length} warning(s):\n- ${warnings.join("\n- ")}`);

if (errors.length) {
  console.error(`❌ ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`✅ Dataset OK: ${ds.venues.length} venues, ${ds.hotels.length} hotels, ${ds.schedule.length} scheduled games`);