/** "YYYY-MM-DD" → a local-time Date at midnight, so formatting never shifts the day. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The subset of Intl date options the UI uses. */
export type DateOptions =
  | { dateStyle: "medium"; timeStyle?: "short" }
  | { day: "numeric"; month: "short" }
  | { month: "short"; year: "numeric" }
  | { weekday: "long" | "short" };

export type DateFormatter = (date: Date, options: DateOptions) => string;

/** Dates are shown in the organisation's zone, like next-intl's formatter. */
export const APP_TIME_ZONE = "Asia/Tashkent";

/* Uzbek (Latin) names. Browsers and Node disagree on, or lack, "uz" locale data, so
   the app spells Uzbek dates itself (CLDR uz-Latn patterns: "1-sen, 2026"). */
const UZ_MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];
const UZ_MONTHS_SHORT = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyn",
  "iyl",
  "avg",
  "sen",
  "okt",
  "noy",
  "dek",
];
const UZ_WEEKDAYS = [
  "yakshanba",
  "dushanba",
  "seshanba",
  "chorshanba",
  "payshanba",
  "juma",
  "shanba",
];
const UZ_WEEKDAYS_SHORT = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    year: get("year"),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
    weekday: weekday < 0 ? 0 : weekday,
  };
}

/** Uzbek rendering of the options the UI uses, independent of ICU locale data. */
export function formatDateUz(date: Date, options: DateOptions, timeZone = APP_TIME_ZONE): string {
  const p = partsIn(date, timeZone);
  if ("weekday" in options) {
    return options.weekday === "long" ? UZ_WEEKDAYS[p.weekday]! : UZ_WEEKDAYS_SHORT[p.weekday]!;
  }
  if ("day" in options) return `${p.day}-${UZ_MONTHS_SHORT[p.month - 1]}`;
  if ("month" in options) {
    const m = UZ_MONTHS_SHORT[p.month - 1]!;
    return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${p.year}`;
  }
  const base = `${p.day}-${UZ_MONTHS_SHORT[p.month - 1]}, ${p.year}`;
  return options.timeStyle ? `${base}, ${p.hour}:${p.minute}` : base;
}

export { UZ_MONTHS };

/** "1 234 567 soʻm" the CLDR uz-Latn way; browsers without "uz" data fall back to English. */
export function formatMoneyUz(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "-" : ""}${grouped} soʻm`;
}
