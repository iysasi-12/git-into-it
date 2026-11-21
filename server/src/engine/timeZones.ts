import type { TimeZone, Venue } from "@app/shared";

/** Campus (Bowling Green, OH) clock. Departure times and drive math use it. */
export const HOME_TIME_ZONE: TimeZone = "ET";

// Minutes to add to a campus-clock time to get local time. ET and CT switch to
// daylight time on the same dates, so the difference is always one hour.
const OFFSET_FROM_HOME: Record<TimeZone, number> = { ET: 0, CT: -60 };

export const venueTimeZone = (venue: Pick<Venue, "timeZone">): TimeZone => venue.timeZone ?? HOME_TIME_ZONE;

/** Local minutes in `tz` -> campus-clock minutes (e.g. 3:30 PM CT -> 4:30 PM ET). */
export const localToHome = (mins: number, tz: TimeZone) => mins - OFFSET_FROM_HOME[tz];

/** Campus-clock minutes -> local minutes in `tz`. */
export const homeToLocal = (mins: number, tz: TimeZone) => mins + OFFSET_FROM_HOME[tz];
