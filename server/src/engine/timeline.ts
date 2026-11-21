import type { MealSlot, TimeZone, TimelineEvent, TravelOption, Venue } from "@app/shared";
import { addDays, fromMinutes, toMinutes } from "./calculator.js";
import { HOME_TIME_ZONE, homeToLocal, localToHome, venueTimeZone } from "./timeZones.js";

const MEAL_TIMES = { breakfast: "08:00", lunch: "12:00", dinner: "18:30" } as const;
const GAME_DURATION_HOURS = 3.5;
const POSTGAME_HOURS = 1;
const REPORT_EARLY_MINUTES = 30;
const DAY = 24 * 60;

const q15 = (mins: number) => Math.round(mins / 15) * 15;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Deterministic schedule for one option. Times are derived from the dataset's
 * drive time and fixed policy constants — never from the AI.
 *
 * All math runs on the campus clock (minutes since midnight of the departure date),
 * so a venue in another time zone can't skew drive times. Each event is then shown
 * in the zone where it happens: campus events in ET, venue events in the venue's zone.
 * `gameTime` and the meal/walkthrough policy times are local to the venue.
 */
export function buildTimeline(
  option: Pick<TravelOption, "departure" | "nights" | "hotel" | "returnDate">,
  meals: MealSlot[],
  venue: Venue,
  gameDate: string,
  gameTime: string,
): TimelineEvent[] {
  const home = HOME_TIME_ZONE;
  const local = venueTimeZone(venue);
  const day0 = option.departure.date;
  /** Campus-clock minutes since midnight of day0 for a local date + time. */
  const at = (date: string, hhmm: string, tz: TimeZone) => daysBetween(day0, date) * DAY + localToHome(toMinutes(hhmm), tz);

  const ev: { at: number; tz: TimeZone; event: string }[] = [];
  const driveMins = Math.round(venue.driveHours * 60);
  const dep = at(day0, option.departure.time, home);
  const arrive = q15(dep + driveMins);
  const kickoff = at(gameDate, gameTime, local);

  ev.push({ at: dep - REPORT_EARLY_MINUTES, tz: home, event: "Team reports to bus loading area" });
  ev.push({ at: dep, tz: home, event: `Buses depart for ${venue.city}, ${venue.state}` });
  ev.push({
    at: arrive,
    tz: local,
    event: option.nights > 0 && option.hotel ? `Arrive and check in at ${option.hotel.name}` : `Arrive at ${venue.stadium}`,
  });

  for (const m of meals) {
    let t = at(m.date, MEAL_TIMES[m.meal], local);
    if (m.date === gameDate && m.label.startsWith("Pre-game")) t = Math.max(kickoff - 4 * 60, option.nights === 0 ? arrive + 15 : -Infinity);
    if (m.date === gameDate && m.label.startsWith("Post-game")) t = q15(kickoff + (GAME_DURATION_HOURS + POSTGAME_HOURS) * 60);
    if (m.date === day0 && m.date !== gameDate) t = Math.max(t, arrive + 30);
    ev.push({ at: t, tz: local, event: m.label });
  }

  for (let i = 1; i < option.nights; i++) {
    ev.push({ at: at(addDays(day0, i), "15:00", local), tz: local, event: "Walkthrough / practice (TBD with host school)" });
  }

  if (option.nights > 0) ev.push({ at: kickoff - 3 * 60, tz: local, event: `Depart hotel for ${venue.stadium}` });
  ev.push({ at: kickoff, tz: local, event: `Kickoff at ${venue.stadium}` });
  const leave = q15(kickoff + (GAME_DURATION_HOURS + POSTGAME_HOURS) * 60);
  ev.push({ at: leave, tz: local, event: "Buses depart for home (post-game meal on board)" });
  ev.push({ at: q15(leave + driveMins), tz: home, event: "Estimated arrival back on campus" });

  return ev
    .filter((e) => e.event !== "Post-game meal (return trip)") // folded into departure event
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const mins = homeToLocal(e.at, e.tz);
      const day = Math.floor(mins / DAY);
      return { date: addDays(day0, day), time: fromMinutes(mins - day * DAY), timeZone: e.tz, event: e.event };
    });
}
