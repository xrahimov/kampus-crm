/*
 * Calendar days as the server writes them ("2026-11-23"). A lesson's day is a
 * day in the centre's calendar, not a moment, so these helpers never go through
 * the phone's time zone.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** The day `days` after (or before) an ISO day. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "2026-11" of an ISO day. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** The month `months` after (or before) "2026-11". */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Noon in Tashkent on that day: a moment that formats as the same day in the centre's zone. */
export function dayAsDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00+05:00`);
}

/** 1 = Monday … 7 = Sunday, as the timetable counts. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** A Monday-first week's day as a date, for spelling weekday names (2024-01-01 was a Monday). */
export function weekdayAsDate(weekday: number): Date {
  return dayAsDate(`2024-01-${pad(weekday)}`);
}
