import { APP_TIME_ZONE } from "./dates";

/*
 * Time zones for students abroad (A-177). The centre keeps every lesson time
 * as a wall-clock time in its own zone (Asia/Tashkent); a student who lives
 * elsewhere sees and is reminded of the same moment in their zone.
 */

/** True for an IANA zone name this runtime knows ("Europe/Berlin"). */
export function isValidTimeZone(zone: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Every zone the runtime can list, for a picker. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? [APP_TIME_ZONE];
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function partsIn(at: Date, zone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")) + 1,
  };
}

/** The zone's offset from UTC, in minutes, at that instant. */
function offsetMinutes(at: Date, zone: string): number {
  const p = partsIn(at, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The instant at which a wall clock in `zone` reads `date` `time` ("2026-11-06", "19:30"). */
export function zonedToUtc(date: string, time: string, zone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - offsetMinutes(new Date(guess), zone) * 60_000;
  // Around a DST change the first guess may land on the other side of it.
  result = guess - offsetMinutes(new Date(result), zone) * 60_000;
  return new Date(result);
}

export interface ZonedClock {
  date: string;
  time: string;
  /** ISO weekday 1 (Monday) to 7 (Sunday). */
  weekday: number;
}

/** The wall clock in `zone` at that instant. */
export function utcToZoned(at: Date, zone: string): ZonedClock {
  const p = partsIn(at, zone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    weekday: p.weekday,
  };
}

export interface LocalLessonTime {
  date: string;
  startTime: string;
  endTime: string;
  /** -1, 0 or 1: the local day is the day before, the same, or the day after the centre's. */
  dayShift: number;
}

/** A lesson of the centre (its date and times) as a student in `zone` experiences it. */
export function lessonInZone(
  lesson: { date: string; startTime: string; endTime: string },
  zone: string,
  centreZone: string = APP_TIME_ZONE,
): LocalLessonTime {
  const start = utcToZoned(zonedToUtc(lesson.date, lesson.startTime, centreZone), zone);
  const end = utcToZoned(zonedToUtc(lesson.date, lesson.endTime, centreZone), zone);
  const dayShift = Math.round(
    (Date.parse(`${start.date}T00:00:00Z`) - Date.parse(`${lesson.date}T00:00:00Z`)) / 86_400_000,
  );
  return { date: start.date, startTime: start.time, endTime: end.time, dayShift };
}

/** A weekly slot (weekday and times) as it falls in `zone`, judged on the next such day from `from`. */
export function slotInZone(
  slot: { weekday: number; startTime: string; endTime: string },
  zone: string,
  from: Date = new Date(),
  centreZone: string = APP_TIME_ZONE,
): { weekday: number; startTime: string; endTime: string } {
  const today = utcToZoned(from, centreZone);
  const ahead = (slot.weekday - today.weekday + 7) % 7;
  const base = new Date(Date.parse(`${today.date}T00:00:00Z`) + ahead * 86_400_000);
  const date = base.toISOString().slice(0, 10);
  const local = lessonInZone(
    { date, startTime: slot.startTime, endTime: slot.endTime },
    zone,
    centreZone,
  );
  const weekday = ((slot.weekday - 1 + local.dayShift + 7) % 7) + 1;
  return { weekday, startTime: local.startTime, endTime: local.endTime };
}

/** "Europe/Berlin (GMT+1)" for labels. */
export function timeZoneLabel(zone: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return name ? `${zone} (${name})` : zone;
  } catch {
    return zone;
  }
}
