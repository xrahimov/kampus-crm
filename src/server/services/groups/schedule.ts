import type { Weekday, WeekdayPattern } from "@/lib/validation/groups";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";

/**
 * Pure schedule arithmetic, shared by the group service and its tests.
 * Dates are "YYYY-MM-DD" strings handled as UTC midnight (see shared.ts).
 */

/** EVEN = Tue/Thu/Sat, ODD = Mon/Wed/Fri, EVERY_DAY = Mon–Sat (A-50). */
export const PATTERN_WEEKDAYS: Record<Exclude<WeekdayPattern, "CUSTOM">, Weekday[]> = {
  EVEN: [2, 4, 6],
  ODD: [1, 3, 5],
  EVERY_DAY: [1, 2, 3, 4, 5, 6],
};

export function weekdaysFor(pattern: WeekdayPattern, custom: Weekday[]): Weekday[] {
  return pattern === "CUSTOM" ? [...new Set(custom)].sort() : PATTERN_WEEKDAYS[pattern];
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" date. */
export function isoWeekday(date: string): Weekday {
  const day = isoToDate(date).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** Same day-of-month N months later, clamped to the last day of that month (A-51). */
export function addMonths(date: string, months: number): string {
  const d = isoToDate(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return dateToIso(target);
}

export function addDays(date: string, days: number): string {
  const d = isoToDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

export interface SlotLike {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface PlannedLesson {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Every meeting between start and end (inclusive) according to the slots,
 * skipping the given days off (branch holidays and group days off).
 */
export function planLessons(
  startDate: string,
  endDate: string,
  slots: SlotLike[],
  daysOff: Iterable<string> = [],
): PlannedLesson[] {
  const byWeekday = new Map(slots.map((s) => [s.weekday, s]));
  const skip = new Set(daysOff);
  const lessons: PlannedLesson[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    const slot = byWeekday.get(isoWeekday(date));
    if (slot && !skip.has(date)) {
      lessons.push({ date, startTime: slot.startTime, endTime: slot.endTime });
    }
  }
  return lessons;
}

/** "YYYY-MM" labels of every month the group runs in, for the month tabs (EXP §5). */
export function courseMonths(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  let cursor = `${startDate.slice(0, 7)}-01`;
  const last = `${endDate.slice(0, 7)}-01`;
  while (cursor <= last) {
    months.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** Whether every lesson day starts and ends at the same time. */
export function sameTimes(slots: SlotLike[]): boolean {
  const first = slots[0];
  return slots.every((s) => s.startTime === first?.startTime && s.endTime === first?.endTime);
}

/**
 * A group's lesson times in one line (A-193): "19:30–21:30" when every day
 * meets at the same time, otherwise each day with its own time,
 * "Mon 20:30–22:00, Fri 16:30–18:00". Null without slots.
 */
export function slotTimes(
  slots: SlotLike[],
  dayName: (weekday: number) => string,
  dash = "–",
): string | null {
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday);
  const first = sorted[0];
  if (!first) return null;
  const range = (s: SlotLike) => `${s.startTime}${dash}${s.endTime}`;
  if (sameTimes(sorted)) return range(first);
  return sorted.map((s) => `${dayName(s.weekday)} ${range(s)}`).join(", ");
}

const WEEKDAY_LOCALES = { uz: "uz-Latn-UZ", ru: "ru-RU", en: "en-GB" } as const;

/** Short weekday name on the server (Node carries the Uzbek names; browsers do not, A-58). */
export function shortWeekday(locale: keyof typeof WEEKDAY_LOCALES, weekday: number): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(WEEKDAY_LOCALES[locale], {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, weekday)));
}

/** When the group meets on that date, going by the date's weekday; nulls when it does not. */
export function slotOn(
  slots: SlotLike[],
  date: string,
): { startTime: string | null; endTime: string | null } {
  const slot = slots.find((s) => s.weekday === isoWeekday(date));
  return { startTime: slot?.startTime ?? null, endTime: slot?.endTime ?? null };
}

/**
 * The group's time ranges in weekday order without the day names, each once:
 * "19:30 – 21:30", or "20:30 – 22:00, 16:30 – 18:00" when the days differ (A-193).
 */
export function timeRanges(slots: SlotLike[], dash = " – ", separator = ", "): string | null {
  const ranges = [...slots]
    .sort((a, b) => a.weekday - b.weekday)
    .map((s) => `${s.startTime}${dash}${s.endTime}`);
  return ranges.length ? [...new Set(ranges)].join(separator) : null;
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The hours a weekly or daily grid must show to hold every lesson on it (A-193):
 * the centre's working hours, stretched outward to whole hours where a lesson
 * starts earlier or ends later, such as a 20:30 lesson at a centre that closes
 * its day at 20:00. Without such lessons it is the working hours themselves.
 */
export function hoursWindow(
  workStart: string,
  workEnd: string,
  lessons: Array<{ startTime: string; endTime: string }>,
): { start: string; end: string } {
  let start = toMinutes(workStart);
  let end = toMinutes(workEnd);
  for (const l of lessons) {
    const from = toMinutes(l.startTime);
    const to = toMinutes(l.endTime);
    if (from < start) start = Math.floor(from / 60) * 60;
    if (to > end) end = Math.min(24 * 60, Math.ceil(to / 60) * 60);
  }
  return { start: toTime(start), end: toTime(end) };
}
