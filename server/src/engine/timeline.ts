import type { MealSlot, TimelineEvent, TravelOption, Venue } from "@app/shared";
import { addDays, fromMinutes, toMinutes } from "./calculator.js";

const MEAL_TIMES = { breakfast: "08:00", lunch: "12:00", dinner: "18:30" } as const;
const GAME_DURATION_HOURS = 3.5;
const POSTGAME_HOURS = 1;
const REPORT_EARLY_MINUTES = 30;

const q15 = (mins: number) => Math.round(mins / 15) * 15;

/**
 * Deterministic schedule for one option. Times are derived from the dataset's
 * drive time and fixed policy constants — never from the AI.
 */
export function buildTimeline(
  option: Pick<TravelOption, "departure" | "nights" | "hotel" | "returnDate">,
  meals: MealSlot[],
  venue: Venue,
  gameDate: string,
  gameTime: string,
): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const driveMins = Math.round(venue.driveHours * 60);
  const dep = toMinutes(option.departure.time);
  const arrive = q15(dep + driveMins);
  const kickoff = toMinutes(gameTime);

  ev.push({ date: option.departure.date, time: fromMinutes(dep - REPORT_EARLY_MINUTES), event: "Team reports to bus loading area" });
  ev.push({ date: option.departure.date, time: option.departure.time, event: `Buses depart for ${venue.city}, ${venue.state}` });
  ev.push({
    date: option.departure.date,
    time: fromMinutes(arrive),
    event: option.nights > 0 && option.hotel ? `Arrive and check in at ${option.hotel.name}` : `Arrive at ${venue.stadium}`,
  });

  for (const m of meals) {
    let t = toMinutes(MEAL_TIMES[m.meal]);
    if (m.date === gameDate && m.label.startsWith("Pre-game")) t = Math.max(kickoff - 4 * 60, option.nights === 0 ? arrive + 15 : 0);
    if (m.date === gameDate && m.label.startsWith("Post-game")) t = q15(kickoff + (GAME_DURATION_HOURS + POSTGAME_HOURS) * 60);
    if (m.date === option.departure.date && m.date !== gameDate) t = Math.max(t, arrive + 30);
    ev.push({ date: m.date, time: fromMinutes(t), event: m.label });
  }

  for (let i = 1; i < option.nights; i++) {
    ev.push({ date: addDays(option.departure.date, i), time: "15:00", event: "Walkthrough / practice (TBD with host school)" });
  }

  if (option.nights > 0) ev.push({ date: gameDate, time: fromMinutes(kickoff - 3 * 60), event: `Depart hotel for ${venue.stadium}` });
  ev.push({ date: gameDate, time: gameTime, event: `Kickoff at ${venue.stadium}` });
  const leave = q15(kickoff + (GAME_DURATION_HOURS + POSTGAME_HOURS) * 60);
  ev.push({ date: gameDate, time: fromMinutes(leave), event: "Buses depart for home (post-game meal on board)" });
  const home = leave + driveMins;
  ev.push({
    date: home >= 24 * 60 ? addDays(gameDate, 1) : gameDate,
    time: fromMinutes(q15(home % (24 * 60))),
    event: "Estimated arrival back on campus",
  });

  return ev
    .filter((e) => !(e.event === "Post-game meal (return trip)")) // folded into departure event
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
