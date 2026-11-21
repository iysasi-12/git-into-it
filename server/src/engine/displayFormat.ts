import { weekday } from "./calculator.js";

/**
 * Display formats for dates and times shown to people (memo itinerary, meal schedule).
 * Engine times are on the home campus clock (Bowling Green, OH), so they're labeled Eastern.
 */
export const HOME_TIME_ZONE = "ET";

/** "2026-10-12" -> "10/12/2026" */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** "2026-10-12" -> "Monday 10/12/2026" */
export function dayLabel(iso: string): string {
  return `${weekday(iso)} ${usDate(iso)}`;
}

/** "13:30" -> "1:30 PM ET", "00:15" -> "12:15 AM ET" */
export function usTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} ${HOME_TIME_ZONE}`;
}
