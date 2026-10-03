import { describe, expect, it } from "vitest";

import {
  addMonths,
  courseMonths,
  isoWeekday,
  planLessons,
  weekdaysFor,
} from "@/server/services/groups/schedule";

describe("schedule arithmetic", () => {
  it("knows ISO weekdays", () => {
    expect(isoWeekday("2026-01-05")).toBe(1); // Monday
    expect(isoWeekday("2026-01-10")).toBe(6); // Saturday
    expect(isoWeekday("2026-01-11")).toBe(7); // Sunday
  });

  it("adds months and clamps to the last day (A-51)", () => {
    expect(addMonths("2026-09-01", 6)).toBe("2027-03-01");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("maps patterns to weekdays (A-50) and de-duplicates custom days", () => {
    expect(weekdaysFor("EVEN", [])).toEqual([2, 4, 6]);
    expect(weekdaysFor("ODD", [])).toEqual([1, 3, 5]);
    expect(weekdaysFor("EVERY_DAY", [])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(weekdaysFor("CUSTOM", [5, 1, 5])).toEqual([1, 5]);
  });

  it("plans one lesson per matching weekday, skipping days off", () => {
    const slots = [
      { weekday: 2, startTime: "09:00", endTime: "10:30" },
      { weekday: 4, startTime: "09:00", endTime: "10:30" },
      { weekday: 6, startTime: "10:00", endTime: "11:00" },
    ];
    // 2026-09-01 is a Tuesday; two weeks → Tue, Thu, Sat ×2 = 6 lessons.
    const plan = planLessons("2026-09-01", "2026-09-14", slots);
    expect(plan.map((l) => l.date)).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-05",
      "2026-09-08",
      "2026-09-10",
      "2026-09-12",
    ]);
    expect(plan[2]).toEqual({ date: "2026-09-05", startTime: "10:00", endTime: "11:00" });

    const withOff = planLessons("2026-09-01", "2026-09-14", slots, ["2026-09-03"]);
    expect(withOff).toHaveLength(5);
    expect(withOff.some((l) => l.date === "2026-09-03")).toBe(false);
  });

  it("returns no lessons when the range is empty or reversed", () => {
    const slots = [{ weekday: 1, startTime: "09:00", endTime: "10:00" }];
    expect(planLessons("2026-09-02", "2026-09-01", slots)).toEqual([]);
    expect(planLessons("2026-09-01", "2026-09-01", slots)).toEqual([]); // a Tuesday
  });

  it("lists the months a course spans", () => {
    expect(courseMonths("2026-09-15", "2027-03-01")).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
    expect(courseMonths("2026-09-01", "2026-09-30")).toEqual(["2026-09"]);
  });
});
