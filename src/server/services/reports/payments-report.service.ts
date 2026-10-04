import type { Prisma } from "@/generated/prisma/client";
import type { ReportPeriod } from "@/lib/validation/reports";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { membershipBalances } from "@/server/services/students/balances";

import { branchIn, monthPeriod, num, pctChange, reportBranch } from "./shared";

/* "To'lovlar hisoboti" (EXP §10): six KPI cards with % change, O'QITUVCHILAR and XODIMLAR tabs. */

export interface ReportKpi {
  value: number;
  /** Secondary count (payments, discounts…) behind the amount. */
  count: number;
  change: number | null;
}

export interface TeacherPaymentRowDto {
  userId: string;
  fullName: string;
  groupsCount: number;
  courses: string[];
  studentsCount: number;
  totalPayments: number;
  debt: number;
}

export interface StaffPaymentRowDto {
  userId: string;
  fullName: string;
  roles: string[];
  paymentsCount: number;
  totalPayments: number;
  refunds: number;
}

export interface PaymentsReportDto {
  year: number;
  month: number;
  branchId: string | null;
  kpis: {
    total: ReportKpi;
    onTime: ReportKpi;
    late: ReportKpi;
    discounts: ReportKpi;
    bonus: ReportKpi;
    refunds: ReportKpi;
  };
  teachers: TeacherPaymentRowDto[];
  staff: StaffPaymentRowDto[];
}

interface Totals {
  total: number;
  count: number;
  onTime: number;
  onTimeCount: number;
  late: number;
  lateCount: number;
  bonus: number;
  discounts: number;
  discountCount: number;
  refunds: number;
  refundCount: number;
}

async function totals(
  db: DbClient,
  scope: Prisma.PaymentWhereInput,
  from: Date,
  to: Date,
): Promise<Totals> {
  const [payments, discounts, refunds] = await Promise.all([
    db.payment.findMany({
      where: { ...scope, paidAt: { gte: from, lte: to } },
      select: { amount: true, bonus: true, paidAt: true, effectiveMonth: true },
    }),
    db.discount.findMany({
      where: {
        givenAt: { gte: from, lte: to },
        membership: { group: branchIn(scope as ReturnType<typeof reportBranch>) },
      },
      select: { amount: true, months: true },
    }),
    db.refund.findMany({
      where: { createdAt: { gte: from, lte: new Date(to.getTime() + 86_400_000) }, payment: scope },
      select: { amount: true },
    }),
  ]);
  const t: Totals = {
    total: 0,
    count: payments.length,
    onTime: 0,
    onTimeCount: 0,
    late: 0,
    lateCount: 0,
    bonus: 0,
    discounts: 0,
    discountCount: discounts.length,
    refunds: 0,
    refundCount: refunds.length,
  };
  for (const p of payments) {
    const amount = num(p.amount);
    t.total += amount;
    t.bonus += num(p.bonus);
    // On time = paid before the month it covers has ended (A-91).
    const monthEnd = new Date(
      Date.UTC(p.effectiveMonth.getUTCFullYear(), p.effectiveMonth.getUTCMonth() + 1, 0),
    );
    if (p.paidAt <= monthEnd) {
      t.onTime += amount;
      t.onTimeCount += 1;
    } else {
      t.late += amount;
      t.lateCount += 1;
    }
  }
  for (const d of discounts) t.discounts += num(d.amount) * d.months;
  for (const r of refunds) t.refunds += num(r.amount);
  return t;
}

export async function getPaymentsReport(
  actor: Actor,
  filters: ReportPeriod,
  db: DbClient = prisma,
): Promise<PaymentsReportDto> {
  authorize(actor, "reports.payments");
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const [cur, prev] = await Promise.all([
    totals(db, scope, period.from, period.to),
    totals(db, scope, period.previous.from, period.previous.to),
  ]);
  const kpi = (value: number, count: number, before: number): ReportKpi => ({
    value,
    count,
    change: pctChange(value, before),
  });

  // Teachers tab: every teacher of a non-archived group in scope, with their groups' money.
  const groups = await db.group.findMany({
    where: { ...branchIn(scope), status: { not: "ARCHIVED" } },
    select: {
      id: true,
      course: { select: { name: true } },
      teachers: { select: { userId: true, user: { select: { fullName: true } } } },
      memberships: {
        where: { status: { notIn: ["ARCHIVED", "GRADUATED"] } },
        select: { id: true },
      },
    },
  });
  const groupIds = groups.map((g) => g.id);
  const [groupPayments, balances] = await Promise.all([
    db.payment.groupBy({
      by: ["membershipId"],
      where: {
        membership: { groupId: { in: groupIds } },
        paidAt: { gte: period.from, lte: period.to },
      },
      _sum: { amount: true },
    }),
    membershipBalances(
      db,
      groups.flatMap((g) => g.memberships.map((m) => m.id)),
    ),
  ]);
  const paidByMembership = new Map(groupPayments.map((p) => [p.membershipId, num(p._sum.amount)]));
  const teachers = new Map<string, TeacherPaymentRowDto & { courseSet: Set<string> }>();
  for (const g of groups) {
    const paid = g.memberships.reduce((s, m) => s + (paidByMembership.get(m.id) ?? 0), 0);
    const debt = g.memberships.reduce((s, m) => {
      const b = balances.get(m.id)?.balance ?? 0;
      return s + (b < 0 ? -b : 0);
    }, 0);
    for (const t of g.teachers) {
      let row = teachers.get(t.userId);
      if (!row) {
        row = {
          userId: t.userId,
          fullName: t.user.fullName,
          groupsCount: 0,
          courses: [],
          courseSet: new Set(),
          studentsCount: 0,
          totalPayments: 0,
          debt: 0,
        };
        teachers.set(t.userId, row);
      }
      row.groupsCount += 1;
      row.courseSet.add(g.course.name);
      row.studentsCount += g.memberships.length;
      row.totalPayments += paid;
      row.debt += debt;
    }
  }

  // Staff tab: whoever received a payment (or made a refund) in the month.
  const [received, refunded] = await Promise.all([
    db.payment.findMany({
      where: {
        ...scope,
        paidAt: { gte: period.from, lte: period.to },
        receivedById: { not: null },
      },
      select: {
        amount: true,
        receivedBy: {
          select: {
            id: true,
            fullName: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    }),
    db.refund.findMany({
      where: {
        payment: scope,
        createdAt: { gte: period.from, lte: new Date(period.to.getTime() + 86_400_000) },
        refundedById: { not: null },
      },
      select: {
        amount: true,
        refundedBy: {
          select: {
            id: true,
            fullName: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);
  const staff = new Map<string, StaffPaymentRowDto>();
  const staffRow = (u: {
    id: string;
    fullName: string;
    roles: Array<{ role: { name: string } }>;
  }) => {
    let row = staff.get(u.id);
    if (!row) {
      row = {
        userId: u.id,
        fullName: u.fullName,
        roles: u.roles.map((r) => r.role.name),
        paymentsCount: 0,
        totalPayments: 0,
        refunds: 0,
      };
      staff.set(u.id, row);
    }
    return row;
  };
  for (const p of received) {
    const row = staffRow(p.receivedBy!);
    row.paymentsCount += 1;
    row.totalPayments += num(p.amount);
  }
  for (const r of refunded) staffRow(r.refundedBy!).refunds += num(r.amount);

  return {
    year: period.year,
    month: period.month,
    branchId: filters.branchId ?? null,
    kpis: {
      total: kpi(cur.total, cur.count, prev.total),
      onTime: kpi(cur.onTime, cur.onTimeCount, prev.onTime),
      late: kpi(cur.late, cur.lateCount, prev.late),
      discounts: kpi(cur.discounts, cur.discountCount, prev.discounts),
      bonus: kpi(cur.bonus, cur.count, prev.bonus),
      refunds: kpi(cur.refunds, cur.refundCount, prev.refunds),
    },
    teachers: [...teachers.values()]
      .map(({ courseSet, ...row }) => ({ ...row, courses: [...courseSet].sort() }))
      .sort((a, b) => b.totalPayments - a.totalPayments || a.fullName.localeCompare(b.fullName)),
    staff: [...staff.values()].sort((a, b) => b.totalPayments - a.totalPayments),
  };
}
