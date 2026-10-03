import { describe, expect, it } from "vitest";

import {
  courseSchema,
  dayOffSchema,
  gradingSystemSchema,
  orgSettingsSchema,
  roomSchema,
} from "@/lib/validation/settings";

const org = {
  name: "Kampus",
  spreadOverpayment: false,
  adminActionsNeedApproval: false,
  printReceiptAfterPayment: false,
  refundsEnabled: true,
  attendanceComments: false,
  teachersSeeExamSchedule: false,
  attendanceOnlyDuringLesson: false,
  teacherSeesSalary: false,
  payTeacherOnGroupDayOff: false,
  payOnlyAttendedLessons: false,
  teacherCanAddStudents: false,
  bookAnySupportTeacher: false,
  groupSupportSessions: false,
  workStart: "08:00",
  workEnd: "20:00",
  scheduleStepMinutes: 30,
};

describe("orgSettingsSchema", () => {
  it("accepts the default shape and coerces the step from a string", () => {
    const parsed = orgSettingsSchema.parse({ ...org, scheduleStepMinutes: "15" });
    expect(parsed.scheduleStepMinutes).toBe(15);
  });

  it("rejects a step other than 15 or 30", () => {
    const result = orgSettingsSchema.safeParse({ ...org, scheduleStepMinutes: 20 });
    expect(result.success).toBe(false);
  });

  it("rejects closing before opening", () => {
    const result = orgSettingsSchema.safeParse({ ...org, workStart: "20:00", workEnd: "08:00" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["workEnd"]);
      expect(result.error.issues[0]?.message).toBe("validation.workHours");
    }
  });

  it("rejects a malformed time", () => {
    expect(orgSettingsSchema.safeParse({ ...org, workStart: "8:00" }).success).toBe(false);
  });
});

describe("courseSchema", () => {
  it("coerces price and duration from form strings and drops an empty description", () => {
    const parsed = courseSchema.parse({
      branchId: "b1",
      name: " General English ",
      description: "",
      price: "450000",
      durationMonths: "6",
      gradingSystemId: null,
      color: "#0F766E",
    });
    expect(parsed).toMatchObject({
      name: "General English",
      price: 450_000,
      durationMonths: 6,
      gradingSystemId: null,
    });
    expect(parsed.description).toBeUndefined();
  });

  it("rejects a negative price, a zero duration and a bad colour", () => {
    const base = { branchId: "b1", name: "x", price: 1, durationMonths: 1 };
    expect(courseSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
    expect(courseSchema.safeParse({ ...base, durationMonths: 0 }).success).toBe(false);
    expect(courseSchema.safeParse({ ...base, color: "teal" }).success).toBe(false);
  });
});

describe("gradingSystemSchema", () => {
  it("requires at least one level and min ≤ max", () => {
    expect(gradingSystemSchema.safeParse({ name: "CEFR", levels: [] }).success).toBe(false);
    const bad = gradingSystemSchema.safeParse({
      name: "CEFR",
      levels: [{ name: "A1", minScore: 50, maxScore: 10 }],
    });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues[0]?.message).toBe("validation.levelRange");
  });

  it("defaults rounding to STANDARD", () => {
    const parsed = gradingSystemSchema.parse({
      name: "CEFR",
      levels: [{ name: "A1", minScore: "0", maxScore: "20" }],
    });
    expect(parsed.rounding).toBe("STANDARD");
    expect(parsed.levels[0]).toEqual({ name: "A1", minScore: 0, maxScore: 20 });
  });
});

describe("roomSchema and dayOffSchema", () => {
  it("coerces capacity and rejects zero", () => {
    expect(roomSchema.parse({ branchId: "b", name: "101", capacity: "12" }).capacity).toBe(12);
    expect(roomSchema.safeParse({ branchId: "b", name: "101", capacity: 0 }).success).toBe(false);
  });

  it("accepts only real YYYY-MM-DD dates", () => {
    expect(dayOffSchema.safeParse({ branchId: "b", date: "2026-03-08", reason: "x" }).success).toBe(
      true,
    );
    expect(dayOffSchema.safeParse({ branchId: "b", date: "08.03.2026", reason: "x" }).success).toBe(
      false,
    );
    expect(dayOffSchema.safeParse({ branchId: "b", date: "2026-13-40", reason: "x" }).success).toBe(
      false,
    );
  });
});
