import type { Prisma } from "@/generated/prisma/client";
import type { DashboardKpiFilters } from "@/lib/validation/dashboard";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { reportBranch } from "@/server/services/reports/shared";
import { dateToIso, decimalToNumber, isoToDate } from "@/server/services/settings/shared";
import {
  addMonthsIso,
  chargeAmount,
  countLessons,
  discountFor,
  monthStart,
  type ChargeWindow,
  type DiscountLike,
} from "@/server/services/students/fees";

/*
 * Revenue forecast (A-133): what this month and the next should bring in,
 * computed the way the fee engine will charge it (active memberships, their
 * price or discount, pro-rated by the lessons they are in), against what has
 * already been paid for those months. Four past months show charged against
 * collected, so the bars read as a trend.
 */

export interface ForecastMonthDto {
  /** "YYYY-MM" */
  month: string;
  kind: "past" | "current" | "next";
  /** Past months: the charges written; current and next: the expected charges. */
  expected: number;
  /** Payments whose effect month is this month (prepayments included). */
  collected: number;
}

export interface ForecastSplitDto {
  id: string | null;
  name: string | null;
  expected: number;
  collected: number;
  nextExpected: number;
}

export interface RevenueForecastDto {
  month: string;
  nextMonth: string;
  current: { expected: number; collected: number; percent: number };
  next: { expected: number; collected: number };
  /** Active memberships behind the current month's figure. */
  memberships: number;
  months: ForecastMonthDto[];
  byBranch: ForecastSplitDto[];
  byCourse: ForecastSplitDto[];
}

const PAST_MONTHS = 4;
const todayIso = () => dateToIso(new Date());

const membershipSelect = {
  id: true,
  status: true,
  joinedAt: true,
  leftAt: true,
  activatedAt: true,
  billingFrom: true,
  frozenAt: true,
  customPrice: true,
  charges: { select: { month: true } },
  discounts: {
    select: {
      id: true,
      discountedPrice: true,
      months: true,
      givenAt: true,
      _count: { select: { charges: true } },
    },
  },
  group: {
    select: {
      branchId: true,
      branch: { select: { name: true } },
      course: { select: { name: true, price: true } },
      lessons: { select: { date: true } },
    },
  },
} satisfies Prisma.GroupMembershipSelect;
type Row = Prisma.GroupMembershipGetPayload<{ select: typeof membershipSelect }>;

/** The month's fee for one membership, as the engine will charge it. */
function expectedCharge(m: Row, month: string, discounts: DiscountLike[]): number {
  const window: ChargeWindow = {
    status: m.status,
    activatedAt: m.activatedAt ? dateToIso(m.activatedAt) : null,
    joinedAt: dateToIso(m.joinedAt),
    leftAt: m.leftAt ? dateToIso(m.leftAt) : null,
    frozenAt: m.frozenAt ? dateToIso(m.frozenAt) : null,
    billingFrom: m.billingFrom ? dateToIso(m.billingFrom) : null,
  };
  const { total, counted } = countLessons(
    m.group.lessons.map((l) => ({ date: dateToIso(l.date) })),
    window,
    month,
  );
  const base = m.customPrice
    ? decimalToNumber(m.customPrice)
    : decimalToNumber(m.group.course.price);
  const discount = discountFor(discounts, month);
  if (discount) discount.used += 1;
  return chargeAmount(discount ? discount.discountedPrice : base, total, counted);
}

export async function getRevenueForecast(
  actor: Actor,
  filters: DashboardKpiFilters,
  db: DbClient = prisma,
): Promise<RevenueForecastDto> {
  authorize(actor, "dashboard.finance");
  const scope = reportBranch(actor, filters.branchId);
  const current = monthStart(todayIso());
  const next = addMonthsIso(current, 1);
  const past = Array.from({ length: PAST_MONTHS }, (_, i) =>
    addMonthsIso(current, i - PAST_MONTHS),
  );
  const months = [...past, current, next];
  const groupScope: Prisma.GroupWhereInput = { ...scope, status: "ACTIVE" };

  const [rows, payments, charges] = await Promise.all([
    db.groupMembership.findMany({
      where: {
        status: "ACTIVE",
        student: { isArchived: false },
        group: { ...groupScope, endDate: { gte: isoToDate(current) } },
      },
      select: membershipSelect,
    }),
    db.payment.findMany({
      where: { ...scope, effectiveMonth: { in: months.map(isoToDate) } },
      select: {
        amount: true,
        effectiveMonth: true,
        branchId: true,
        membership: { select: { group: { select: { course: { select: { name: true } } } } } },
      },
    }),
    db.charge.findMany({
      where: { month: { in: past.map(isoToDate) }, membership: { group: scope } },
      select: { month: true, amount: true },
    }),
  ]);

  const key = (d: Date) => dateToIso(d).slice(0, 7);
  const collected = new Map<string, number>();
  const collectedByBranch = new Map<string, number>();
  const collectedByCourse = new Map<string, number>();
  for (const p of payments) {
    const month = key(p.effectiveMonth);
    const amount = decimalToNumber(p.amount);
    collected.set(month, (collected.get(month) ?? 0) + amount);
    if (month === current.slice(0, 7)) {
      collectedByBranch.set(p.branchId, (collectedByBranch.get(p.branchId) ?? 0) + amount);
      const course = p.membership.group.course.name;
      collectedByCourse.set(course, (collectedByCourse.get(course) ?? 0) + amount);
    }
  }
  const charged = new Map<string, number>();
  for (const c of charges) {
    const month = key(c.month);
    charged.set(month, (charged.get(month) ?? 0) + decimalToNumber(c.amount));
  }

  let expectedCurrent = 0;
  let expectedNext = 0;
  const byBranch = new Map<string, ForecastSplitDto>();
  const byCourse = new Map<string, ForecastSplitDto>();
  for (const m of rows) {
    // The engine uses a discount month by month; a current month not yet
    // charged will take one, which then counts as used for the next month.
    const discounts: DiscountLike[] = m.discounts.map((d) => ({
      id: d.id,
      discountedPrice: decimalToNumber(d.discountedPrice),
      months: d.months,
      givenAt: dateToIso(d.givenAt),
      used: d._count.charges,
    }));
    const currentCharged = m.charges.some((c) => dateToIso(c.month) === current);
    const forCurrent = expectedCharge(m, current, discounts);
    if (currentCharged) {
      // Its discount, if any, is already counted in `used`; undo the increment above.
      const d = discountFor(discounts, current);
      if (d) d.used -= 1;
    }
    const forNext = expectedCharge(m, next, discounts);
    expectedCurrent += forCurrent;
    expectedNext += forNext;
    const branch = byBranch.get(m.group.branchId) ?? {
      id: m.group.branchId,
      name: m.group.branch.name,
      expected: 0,
      collected: collectedByBranch.get(m.group.branchId) ?? 0,
      nextExpected: 0,
    };
    branch.expected += forCurrent;
    branch.nextExpected += forNext;
    byBranch.set(m.group.branchId, branch);
    const course = byCourse.get(m.group.course.name) ?? {
      id: null,
      name: m.group.course.name,
      expected: 0,
      collected: collectedByCourse.get(m.group.course.name) ?? 0,
      nextExpected: 0,
    };
    course.expected += forCurrent;
    course.nextExpected += forNext;
    byCourse.set(m.group.course.name, course);
  }

  const cur = current.slice(0, 7);
  const nxt = next.slice(0, 7);
  const collectedCurrent = collected.get(cur) ?? 0;
  const bySize = (a: ForecastSplitDto, b: ForecastSplitDto) =>
    b.expected - a.expected || (a.name ?? "").localeCompare(b.name ?? "");
  return {
    month: cur,
    nextMonth: nxt,
    current: {
      expected: expectedCurrent,
      collected: collectedCurrent,
      percent:
        expectedCurrent > 0
          ? Math.round((collectedCurrent / expectedCurrent) * 1000) / 10
          : collectedCurrent > 0
            ? 100
            : 0,
    },
    next: { expected: expectedNext, collected: collected.get(nxt) ?? 0 },
    memberships: rows.length,
    months: months.map((m) => {
      const k = m.slice(0, 7);
      const kind = m === current ? "current" : m === next ? "next" : "past";
      return {
        month: k,
        kind,
        expected:
          kind === "past"
            ? (charged.get(k) ?? 0)
            : kind === "current"
              ? expectedCurrent
              : expectedNext,
        collected: collected.get(k) ?? 0,
      };
    }),
    byBranch: [...byBranch.values()].sort(bySize),
    byCourse: [...byCourse.values()].sort(bySize),
  };
}
