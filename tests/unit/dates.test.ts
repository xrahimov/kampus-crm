import { describe, expect, it } from "vitest";

import { formatDateUz, formatMoneyUz, parseDateOnly } from "@/lib/dates";

describe("Uzbek date formatting", () => {
  const d = parseDateOnly("2026-09-01"); // a Tuesday
  it("spells dates the CLDR uz-Latn way, without depending on ICU data", () => {
    expect(formatDateUz(d, { dateStyle: "medium" })).toBe("1-sen, 2026");
    expect(formatDateUz(d, { day: "numeric", month: "short" })).toBe("1-sen");
    expect(formatDateUz(d, { month: "short", year: "numeric" })).toBe("Sen 2026");
    expect(formatDateUz(d, { weekday: "long" })).toBe("seshanba");
    expect(formatDateUz(d, { weekday: "short" })).toBe("Se");
  });
  it("adds the time in the organisation's zone", () => {
    // 2026-10-03T14:05Z is 19:05 in Tashkent (UTC+5).
    const at = new Date("2026-10-03T14:05:00.000Z");
    expect(formatDateUz(at, { dateStyle: "medium", timeStyle: "short" })).toBe(
      "3-okt, 2026, 19:05",
    );
  });
});

describe("Uzbek money formatting", () => {
  it("groups thousands with a non-breaking space and appends soʻm", () => {
    expect(formatMoneyUz(1234567)).toBe("1\u00a0234\u00a0567\u00a0soʻm");
    expect(formatMoneyUz(900)).toBe("900\u00a0soʻm");
    expect(formatMoneyUz(0)).toBe("0\u00a0soʻm");
    expect(formatMoneyUz(-120000.4)).toBe("-120\u00a0000\u00a0soʻm");
  });
});
