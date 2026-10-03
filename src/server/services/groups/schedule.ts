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
