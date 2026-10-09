import { describe, expect, it } from "vitest";

import {
  addMonthsIso,
  allocateInstalments,
  chargeAmount,
  chargeableMonths,
  chargedFrom,
  countLessons,
  discountFor,
  firstUnpaidMonth,
  monthsBetween,
} from "@/server/services/students/fees";

const lessons = ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10", "2026-10-01"].map(
  (date) => ({ date }),
);
const active = {
  status: "ACTIVE" as const,
  activatedAt: "2026-09-01",
  joinedAt: "2026-09-01",
  leftAt: null,
  frozenAt: null,
};

describe("fee engine (A-10)", () => {
  it("walks months", () => {
    expect(addMonthsIso("2026-12-01", 1)).toBe("2027-01-01");
    expect(monthsBetween("2026-09-15", "2026-11-02")).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });

  it("counts only the lessons the student is in", () => {
    expect(countLessons(lessons, active, "2026-09-01")).toEqual({ total: 4, counted: 4 });
    expect(countLessons(lessons, { ...active, activatedAt: "2026-09-08" }, "2026-09-01")).toEqual({
      total: 4,
      counted: 2,
    });
    expect(countLessons(lessons, { ...active, leftAt: "2026-09-10" }, "2026-09-01")).toEqual({
      total: 4,
      counted: 3,
    });
    expect(
      countLessons(lessons, { ...active, status: "FROZEN", frozenAt: "2026-09-03" }, "2026-09-01"),
    ).toEqual({ total: 4, counted: 1 });
    expect(countLessons(lessons, { ...active, status: "TRIAL" }, "2026-09-01")).toEqual({
      total: 4,
      counted: 0,
    });
  });

  it("pro-rates and rounds the monthly price", () => {
    expect(chargeAmount(450_000, 4, 4)).toBe(450_000);
    expect(chargeAmount(450_000, 13, 5)).toBe(173_077);
    expect(chargeAmount(450_000, 0, 0)).toBe(0);
  });

  it("charges from activation through today, the course end, or the month the student left", () => {
    expect(chargeableMonths(active, "2027-03-01", "2026-11-15")).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(chargeableMonths(active, "2026-10-31", "2027-02-01")).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(
      chargeableMonths({ ...active, leftAt: "2026-10-05" }, "2027-03-01", "2027-01-01"),
    ).toEqual(["2026-09-01", "2026-10-01"]);
    expect(
      chargeableMonths(
        { ...active, status: "TRIAL", activatedAt: null },
        "2027-03-01",
        "2026-11-15",
      ),
    ).toEqual([]);
    expect(
      chargeableMonths({ ...active, activatedAt: "2026-12-01" }, "2027-03-01", "2026-11-15"),
    ).toEqual([]);
  });

  it("picks the earliest open discount for a month", () => {
    const d1 = { id: "a", discountedPrice: 300_000, months: 1, givenAt: "2026-09-10", used: 1 };
    const d2 = { id: "b", discountedPrice: 350_000, months: 2, givenAt: "2026-10-01", used: 0 };
    expect(discountFor([d1, d2], "2026-09-01")).toBeNull();
    expect(discountFor([d1, d2], "2026-10-01")?.id).toBe("b");
    expect(discountFor([d2], "2026-09-01")).toBeNull();
  });

  it("finds the month the payments stop covering", () => {
    const charges = [
      { month: "2026-10-01", amount: 450_000 },
      { month: "2026-09-01", amount: 450_000 },
      { month: "2026-11-01", amount: 450_000 },
    ];
    expect(firstUnpaidMonth(charges, 1_350_000)).toBeNull();
    expect(firstUnpaidMonth(charges, 900_000)).toBe("2026-11-01");
    expect(firstUnpaidMonth(charges, 0)).toBe("2026-09-01");
  });
  it("charges from the chosen billing day when one is set (A-110)", () => {
    expect(chargedFrom({ ...active, billingFrom: "2026-10-01" })).toBe("2026-10-01");
    expect(chargedFrom({ ...active, billingFrom: null })).toBe("2026-09-01");
    expect(chargedFrom({ ...active, status: "NEW", billingFrom: "2026-10-01" })).toBeNull();
    expect(
      chargeableMonths({ ...active, billingFrom: "2026-10-01" }, "2027-03-01", "2026-11-15"),
    ).toEqual(["2026-10-01", "2026-11-01"]);
    expect(countLessons(lessons, { ...active, billingFrom: "2026-09-08" }, "2026-09-01")).toEqual({
      total: 4,
      counted: 2,
    });
  });
});

describe("instalments (A-123)", () => {
  const charges = [
    { month: "2026-09-01", amount: 300_000 },
    { month: "2026-10-01", amount: 300_000 },
  ];
  // Out of order on purpose: the engine sorts the parts by their day.
  const parts = [
    { id: "b", month: "2026-10-01", dueDate: "2026-10-20", amount: 150_000 },
    { id: "a", month: "2026-10-01", dueDate: "2026-10-05", amount: 150_000 },
  ];

  it("pays the parts in due-day order and defers the ones not due yet", () => {
    const r = allocateInstalments(charges, parts, 450_000, "2026-10-09");
    expect(r.parts.map((p) => [p.id, p.paid, p.remaining])).toEqual([
      ["a", true, 0],
      ["b", false, 150_000],
    ]);
    expect(r.deferred).toBe(150_000);
    expect(r.firstUnpaidDate).toBeNull();
    expect(r.nextDueDate).toBe("2026-10-20");
  });

  it("counts a part as due once its day has passed", () => {
    const r = allocateInstalments(charges, parts, 300_000, "2026-10-09");
    expect(r.parts.map((p) => p.remaining)).toEqual([150_000, 150_000]);
    expect(r.deferred).toBe(150_000);
    expect(r.firstUnpaidDate).toBe("2026-10-05");
  });

  it("covers a part partly and leaves what the parts do not schedule due with the month", () => {
    const r = allocateInstalments(
      [{ month: "2026-10-01", amount: 400_000 }],
      parts,
      100_000,
      "2026-10-01",
    );
    expect(r.parts.map((p) => p.remaining)).toEqual([50_000, 150_000]);
    expect(r.deferred).toBe(200_000);
    expect(r.firstUnpaidDate).toBe("2026-10-01");
  });

  it("lists the parts of a month not charged yet as planned, covered by the credit left over", () => {
    const r = allocateInstalments(
      [{ month: "2026-10-01", amount: 300_000 }],
      [
        { id: "n2", month: "2026-11-01", dueDate: "2026-11-16", amount: 150_000 },
        { id: "n1", month: "2026-11-01", dueDate: "2026-11-01", amount: 150_000 },
      ],
      350_000,
      "2026-10-09",
    );
    expect(r.parts.map((p) => [p.id, p.paid, p.remaining])).toEqual([
      ["n1", false, 100_000],
      ["n2", false, 150_000],
    ]);
    expect(r.deferred).toBe(0);
    expect(r.firstUnpaidDate).toBeNull();
    expect(r.nextDueDate).toBeNull();
  });

  it("trims parts that add up to more than the charge", () => {
    const r = allocateInstalments(
      [{ month: "2026-10-01", amount: 200_000 }],
      parts,
      0,
      "2026-10-30",
    );
    expect(r.parts.map((p) => p.amount)).toEqual([150_000, 50_000]);
    expect(r.deferred).toBe(0);
    expect(r.firstUnpaidDate).toBe("2026-10-05");
  });

  it("is the plain engine without parts", () => {
    const r = allocateInstalments(charges, [], 100_000, "2026-10-09");
    expect(r.parts).toEqual([]);
    expect(r.deferred).toBe(0);
    expect(r.firstUnpaidDate).toBe("2026-09-01");
    expect(r.nextDueDate).toBeNull();
  });
});
