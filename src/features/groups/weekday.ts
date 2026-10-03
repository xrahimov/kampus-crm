import type { useFormatter } from "next-intl";

import type { Weekday, WeekdayPattern } from "@/lib/validation/groups";

/** 2026-01-05 is a Monday; weekday N is N-1 days later. */
export function weekdayLabel(
  format: ReturnType<typeof useFormatter>,
  weekday: Weekday,
  style: "short" | "long" = "short",
): string {
  return format.dateTime(new Date(Date.UTC(2026, 0, 4 + weekday, 12)), { weekday: style });
}

/** EVEN = Tue/Thu/Sat, ODD = Mon/Wed/Fri, EVERY_DAY = Mon–Sat (A-50); mirrors the server. */
export const PATTERN_DAYS: Record<Exclude<WeekdayPattern, "CUSTOM">, Weekday[]> = {
  EVEN: [2, 4, 6],
  ODD: [1, 3, 5],
  EVERY_DAY: [1, 2, 3, 4, 5, 6],
};

export function patternDays(pattern: WeekdayPattern, custom: Weekday[]): Weekday[] {
  return pattern === "CUSTOM" ? custom : PATTERN_DAYS[pattern];
}
