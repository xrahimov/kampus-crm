import { APP_TIME_ZONE } from "@/lib/dates";
import type { DbClient } from "@/server/db/prisma";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";

/* Vocabulary practice days and streaks (A-165); shared with the badges (A-163). */

/** The calendar day in Tashkent, as "YYYY-MM-DD". */
export function localDay(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Days in a row with practice, ending today or yesterday (Tashkent days). */
export async function vocabStreak(
  db: DbClient,
  membershipId: string,
  todayDay: string = localDay(),
): Promise<number> {
  const days = await db.vocabDay.findMany({
    where: { membershipId },
    orderBy: { date: "desc" },
    take: 400,
    select: { date: true },
  });
  const have = new Set(days.map((d) => dateToIso(d.date)));
  let cursor = isoToDate(todayDay);
  if (!have.has(todayDay)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (have.has(dateToIso(cursor))) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
