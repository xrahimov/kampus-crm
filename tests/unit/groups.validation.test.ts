import { describe, expect, it } from "vitest";

import { addMemberSchema, groupSchema } from "@/lib/validation/groups";

const base = {
  branchId: "b1",
  name: "GE-1",
  courseId: "c1",
  weekdayPattern: "EVEN",
  slots: [{ weekday: 2, startTime: "09:00", endTime: "10:30" }],
  teachers: [],
  startDate: "2026-09-01",
};

describe("group schema", () => {
  it("accepts a minimal group and applies defaults", () => {
    const parsed = groupSchema.parse(base);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.slots[0]?.roomId).toBeUndefined();
  });

  it("rejects an end time before the start, duplicate weekdays and an end before the start date", () => {
    const bad = groupSchema.safeParse({
      ...base,
      slots: [
        { weekday: 2, startTime: "10:00", endTime: "09:00" },
        { weekday: 2, startTime: "09:00", endTime: "10:00" },
      ],
      endDate: "2026-08-01",
    });
    expect(bad.success).toBe(false);
    const messages = bad.success ? [] : bad.error.issues.map((i) => i.message);
    expect(messages).toContain("validation.workHours");
    expect(messages).toContain("validation.slotsUnique");
    expect(messages).toContain("validation.endAfterStart");
  });

  it("caps teachers at three and forbids the same teacher twice", () => {
    const teacher = (userId: string) => ({
      userId,
      role: "MAIN",
      shareType: "PERCENT",
      shareValue: 10,
    });
    const many = groupSchema.safeParse({
      ...base,
      teachers: [teacher("u1"), teacher("u2"), teacher("u3"), teacher("u4")],
    });
    expect(many.success).toBe(false);
    const twice = groupSchema.safeParse({ ...base, teachers: [teacher("u1"), teacher("u1")] });
    expect(twice.success ? [] : twice.error.issues.map((i) => i.message)).toContain(
      "validation.teachersUnique",
    );
  });
});

describe("add member schema", () => {
  it("needs exactly one of studentId and newStudent", () => {
    expect(addMemberSchema.safeParse({ joinedAt: "2026-09-01" }).success).toBe(false);
    expect(
      addMemberSchema.safeParse({
        joinedAt: "2026-09-01",
        studentId: "s1",
        newStudent: { fullName: "X" },
      }).success,
    ).toBe(false);
    const ok = addMemberSchema.parse({ joinedAt: "2026-09-01", studentId: "s1", customPrice: "" });
    expect(ok.customPrice).toBeNull();
    expect(ok.status).toBe("ACTIVE");
  });
});
