import { describe, expect, it } from "vitest";

import { defaultHomeworkLesson } from "@/lib/homework";
import { sameClock } from "@/lib/time-zones";
import { centreToday } from "@/server/services/groups/shared";

/*
 * The server runs in UTC and the centre's day is Tashkent's (UTC+5): from 19:00
 * UTC the centre is already on tomorrow. "Today's lesson" follows the centre.
 */
describe("the centre's day", () => {
  it("is the UTC day until 19:00 UTC", () => {
    expect(centreToday(new Date("2026-11-12T18:59:59Z"))).toBe("2026-11-12");
  });

  it("is already tomorrow from 19:00 UTC, midnight in Tashkent", () => {
    expect(centreToday(new Date("2026-11-12T19:00:00Z"))).toBe("2026-11-13");
    expect(centreToday(new Date("2026-11-12T20:50:00Z"))).toBe("2026-11-13");
  });

  it("crosses a month and a year", () => {
    expect(centreToday(new Date("2026-11-30T21:00:00Z"))).toBe("2026-12-01");
    expect(centreToday(new Date("2026-12-31T19:30:00Z"))).toBe("2027-01-01");
  });
});

describe("zones with the same clock", () => {
  const at = new Date("2026-11-12T12:00:00Z");

  it("treats Samarkand and Tashkent as the same", () => {
    expect(sameClock("Asia/Samarkand", "Asia/Tashkent", at)).toBe(true);
    expect(sameClock("Asia/Tashkent", "Asia/Tashkent", at)).toBe(true);
  });

  it("tells Berlin from Tashkent", () => {
    expect(sameClock("Europe/Berlin", "Asia/Tashkent", at)).toBe(false);
  });

  it("does not throw on a zone the browser made up", () => {
    expect(sameClock("Nowhere/Nothing", "Asia/Tashkent", at)).toBe(false);
  });
});

describe("the lesson Set homework starts on", () => {
  const lesson = (id: string, date: string, hasHomework = false) => ({ id, date, hasHomework });
  const lessons = [
    lesson("a", "2026-11-07"),
    lesson("b", "2026-11-10"),
    lesson("c", "2026-11-12"),
    lesson("d", "2026-11-14"),
    lesson("e", "2026-11-26"),
  ];

  it("is the lesson just taught", () => {
    expect(defaultHomeworkLesson(lessons, "2026-11-12")).toBe("c");
    expect(defaultHomeworkLesson(lessons, "2026-11-13")).toBe("c");
  });

  it("skips lessons that already have homework", () => {
    const taken = lessons.map((l) => (l.id === "c" ? { ...l, hasHomework: true } : l));
    expect(defaultHomeworkLesson(taken, "2026-11-12")).toBe("b");
  });

  it("is the nearest coming lesson when nothing was taught yet", () => {
    expect(defaultHomeworkLesson(lessons, "2026-11-01")).toBe("a");
    expect(defaultHomeworkLesson([lessons[4]!, lessons[3]!], "2026-11-13")).toBe("d");
  });

  it("is empty when every lesson has homework", () => {
    expect(defaultHomeworkLesson([lesson("a", "2026-11-07", true)], "2026-11-12")).toBe("");
  });
});
