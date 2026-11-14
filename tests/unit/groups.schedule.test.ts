import { describe, expect, it } from "vitest";

import {
  addMonths,
  courseMonths,
  hoursWindow,
  isoWeekday,
  planLessons,
  sameTimes,
  shortWeekday,
  slotOn,
  slotTimes,
  timeRanges,
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

  describe("a time of its own for each day (A-193)", () => {
    const even = [2, 4, 6].map((weekday) => ({ weekday, startTime: "19:30", endTime: "21:30" }));
    const monFri = [
      { weekday: 5, startTime: "16:30", endTime: "18:00" },
      { weekday: 1, startTime: "20:30", endTime: "22:00" },
    ];
    const en = (weekday: number) => shortWeekday("en", weekday);

    it("plans each weekday at its own time", () => {
      // 2026-11-16 is a Monday.
      expect(planLessons("2026-11-16", "2026-11-22", monFri)).toEqual([
        { date: "2026-11-16", startTime: "20:30", endTime: "22:00" },
        { date: "2026-11-20", startTime: "16:30", endTime: "18:00" },
      ]);
    });

    it("writes one range when the days agree and every day when they do not", () => {
      expect(sameTimes(even)).toBe(true);
      expect(sameTimes(monFri)).toBe(false);
      expect(slotTimes(even, en)).toBe("19:30–21:30");
      expect(slotTimes(monFri, en)).toBe("Mon 20:30–22:00, Fri 16:30–18:00");
      expect(slotTimes([], en)).toBeNull();
      expect(timeRanges(even)).toBe("19:30 – 21:30");
      expect(timeRanges(monFri)).toBe("20:30 – 22:00, 16:30 – 18:00");
      expect(timeRanges(monFri, "–", " / ")).toBe("20:30–22:00 / 16:30–18:00");
      expect(timeRanges([])).toBeNull();
    });

    it("finds the time of a date by its weekday", () => {
      expect(slotOn(monFri, "2026-11-20")).toEqual({ startTime: "16:30", endTime: "18:00" });
      expect(slotOn(monFri, "2026-11-16")).toEqual({ startTime: "20:30", endTime: "22:00" });
      expect(slotOn(monFri, "2026-11-17")).toEqual({ startTime: null, endTime: null });
    });

    it("stretches a grid's hours to hold a lesson outside the working hours", () => {
      expect(hoursWindow("08:00", "20:00", [])).toEqual({ start: "08:00", end: "20:00" });
      expect(hoursWindow("08:00", "20:00", even)).toEqual({ start: "08:00", end: "22:00" });
      expect(hoursWindow("08:00", "20:00", monFri)).toEqual({ start: "08:00", end: "22:00" });
      expect(hoursWindow("09:00", "18:00", [{ startTime: "07:30", endTime: "08:45" }])).toEqual({
        start: "07:00",
        end: "18:00",
      });
      expect(hoursWindow("08:00", "20:00", [{ startTime: "22:30", endTime: "23:50" }])).toEqual({
        start: "08:00",
        end: "24:00",
      });
    });

    it("names weekdays in the three languages", () => {
      expect(shortWeekday("en", 1)).toBe("Mon");
      expect(shortWeekday("ru", 5)).toBe("пт");
      expect(shortWeekday("uz", 1)).toBe("Dush");
    });
  });
});
