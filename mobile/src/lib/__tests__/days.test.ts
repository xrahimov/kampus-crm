import { addDays, addMonths, dayAsDate, monthOf, weekdayAsDate, weekdayOf } from "@/lib/days";

describe("calendar days", () => {
  it("steps over month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("steps months", () => {
    expect(monthOf("2026-11-23")).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("counts weekdays from Monday, as the timetable does", () => {
    expect(weekdayOf("2026-11-23")).toBe(1); // a Monday
    expect(weekdayOf("2026-11-29")).toBe(7); // a Sunday
    for (let day = 1; day <= 7; day += 1) {
      expect(weekdayOf(weekdayAsDate(day).toISOString().slice(0, 10))).toBe(day);
    }
  });

  it("gives a moment that is the same day in Tashkent", () => {
    const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(
      dayAsDate("2026-11-23"),
    );
    expect(formatted).toBe("2026-11-23");
  });
});
