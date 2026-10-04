import type { Prisma } from "@/generated/prisma/client";
import type { FinanceEntryType, FinancePeriod, FinancePlanFilters } from "@/lib/validation/finance";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { membershipBalances } from "@/server/services/students/balances";
import { dateToIso, decimalToNumber } from "@/server/services/settings/shared";

import { financeBranch, monthIso, periodRange } from "./shared";

/* "Umumiy raqamlar", the charts and the monthly plan (EXP §9, A-76). */

export interface FinanceOverviewDto {
  income: number;
  studentIncome: number;
  otherIncome: number;
  expenses: number;
  profit: number;
  activeBalance: number;
  investments: number;
  ltv: number;
  cac: number;
  marketingEfficiency: number;
  averagePayment: number;
  paymentCount: number;
  byMethod: Array<{ id: string | null; name: string | null; amount: number }>;
  /** Twelve months of the chosen year. */
  yearly: Array<{ month: string; income: number; expenses: number }>;
}

/** Entry types that leave the till. Fines are deducted from salaries, not paid out. */
const OUTFLOW: FinanceEntryType[] = ["EXPENSE", "MARKETING", "ADVANCE", "BONUS"];

const num = (v: { toString(): string } | null | undefined) => (v ? decimalToNumber(v) : 0);

export async function getFinanceOverview(
  actor: Actor,
  period: FinancePeriod,
  db: DbClient = prisma,
): Promise<FinanceOverviewDto> {
  authorize(actor, "finance.view");
  const entryScope = financeBranch(actor, period.branchId);
  const payScope: Prisma.PaymentWhereInput = period.branchId
    ? { branchId: period.branchId }
    : (branchScope(actor) ?? {});
  const { from, to } = periodRange(period.year, period.month);
  const year = periodRange(period.year);
  const method = period.paymentMethodId ? { paymentMethodId: period.paymentMethodId } : {};
  const inPeriod = { gte: from, lte: to };

  const [
    payments,
    refunds,
    otherIncome,
    outflow,
    marketing,
    investments,
    allPayments,
    allRefunds,
    allOtherIncome,
    allOutflow,
    payingStudents,
    newStudents,
    newStudentIncome,
    byMethod,
    yearPayments,
    yearEntries,
  ] = await Promise.all([
    db.payment.aggregate({
      where: { ...payScope, ...method, paidAt: inPeriod },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.refund.aggregate({
      where: { payment: { ...payScope, ...method, paidAt: inPeriod } },
      _sum: { amount: true },
    }),
    db.financeEntry.aggregate({
      where: { ...entryScope, ...method, type: "INCOME", date: inPeriod },
      _sum: { amount: true },
    }),
    db.financeEntry.aggregate({
      where: { ...entryScope, ...method, type: { in: OUTFLOW }, date: inPeriod },
      _sum: { amount: true },
    }),
    db.financeEntry.aggregate({
      where: { ...entryScope, ...method, type: "MARKETING", date: inPeriod },
      _sum: { amount: true },
    }),
    db.financeEntry.aggregate({
      where: { ...entryScope, type: "INVESTMENT" },
      _sum: { amount: true },
    }),
    db.payment.aggregate({ where: payScope, _sum: { amount: true } }),
    db.refund.aggregate({ where: { payment: payScope }, _sum: { amount: true } }),
    db.financeEntry.aggregate({
      where: { ...entryScope, type: "INCOME" },
      _sum: { amount: true },
    }),
    db.financeEntry.aggregate({
      where: { ...entryScope, type: { in: OUTFLOW } },
      _sum: { amount: true },
    }),
    db.payment.findMany({ where: payScope, distinct: ["studentId"], select: { studentId: true } }),
    db.student.count({
      where: {
        ...(payScope.branchId ? { branchId: payScope.branchId as string } : {}),
        createdAt: inPeriod,
      },
    }),
    db.payment.aggregate({
      where: { ...payScope, ...method, student: { createdAt: inPeriod } },
      _sum: { amount: true },
    }),
    db.payment.groupBy({
      by: ["paymentMethodId"],
      where: { ...payScope, paidAt: inPeriod },
      _sum: { amount: true },
    }),
    db.payment.findMany({
      where: { ...payScope, ...method, paidAt: { gte: year.from, lte: year.to } },
      select: { paidAt: true, amount: true },
    }),
    db.financeEntry.findMany({
      where: {
        ...entryScope,
        ...method,
        type: { in: [...OUTFLOW, "INCOME" as const] },
        date: { gte: year.from, lte: year.to },
      },
      select: { date: true, amount: true, type: true },
    }),
  ]);

  const studentIncome = num(payments._sum.amount) - num(refunds._sum.amount);
  const other = num(otherIncome._sum.amount);
  const income = studentIncome + other;
  const expenses = num(outflow._sum.amount);
  const marketingSpend = num(marketing._sum.amount);
  const allStudentIncome = num(allPayments._sum.amount) - num(allRefunds._sum.amount);
  const allIncome = allStudentIncome + num(allOtherIncome._sum.amount);
  const methods = await db.paymentMethod.findMany({
    where: { id: { in: byMethod.map((m) => m.paymentMethodId).filter((x): x is string => !!x) } },
    select: { id: true, name: true },
  });
  const methodName = new Map(methods.map((m) => [m.id, m.name]));
  const yearly = Array.from({ length: 12 }, (_, i) => ({
    month: monthIso(period.year, i + 1),
    income: 0,
    expenses: 0,
  }));
  for (const p of yearPayments) yearly[p.paidAt.getUTCMonth()]!.income += decimalToNumber(p.amount);
  for (const e of yearEntries) {
    const bucket = yearly[e.date.getUTCMonth()]!;
    if (e.type === "INCOME") bucket.income += decimalToNumber(e.amount);
    else bucket.expenses += decimalToNumber(e.amount);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    income: round(income),
    studentIncome: round(studentIncome),
    otherIncome: round(other),
    expenses: round(expenses),
    profit: round(income - expenses),
    investments: round(num(investments._sum.amount)),
    activeBalance: round(num(investments._sum.amount) + allIncome - num(allOutflow._sum.amount)),
    ltv: payingStudents.length ? round(allStudentIncome / payingStudents.length) : 0,
    cac: newStudents ? round(marketingSpend / newStudents) : 0,
    marketingEfficiency: marketingSpend
      ? round((num(newStudentIncome._sum.amount) / marketingSpend) * 100)
      : 0,
    averagePayment: payments._count._all
      ? round(num(payments._sum.amount) / payments._count._all)
      : 0,
    paymentCount: payments._count._all,
    byMethod: byMethod
      .map((m) => ({
        id: m.paymentMethodId,
        name: m.paymentMethodId ? (methodName.get(m.paymentMethodId) ?? null) : null,
        amount: round(num(m._sum.amount)),
      }))
      .sort((a, b) => b.amount - a.amount),
    yearly: yearly.map((y) => ({ ...y, income: round(y.income), expenses: round(y.expenses) })),
  };
}

export interface FinancePlanDto {
  month: string;
  effective: boolean;
  plan: number;
  achieved: number;
  expected: number;
  achievedPercent: number;
  activeDebt: number;
  debtors: number;
  prepayments: number;
}

/**
 * "<month> oyidagi rejasi": the plan is what the month's charges add up to
 * (no plan input exists in the reference, EXP §9 [INFERRED]); "Erishilgan" is
 * what was paid, by effect month ("Tasir vaqti") or by payment date.
 */
export async function getFinancePlan(
  actor: Actor,
  filters: FinancePlanFilters,
  db: DbClient = prisma,
): Promise<FinancePlanDto> {
  authorize(actor, "finance.view");
  const payScope: Prisma.PaymentWhereInput = filters.branchId
    ? { branchId: filters.branchId }
    : (branchScope(actor) ?? {});
  financeBranch(actor, filters.branchId); // branch access check
  const { from, to } = periodRange(filters.year, filters.month);
  const groupScope: Prisma.GroupWhereInput = filters.branchId
    ? { branchId: filters.branchId }
    : (branchScope(actor) ?? {});
  const memberships = await db.groupMembership.findMany({
    where: { group: groupScope, status: { in: ["ACTIVE", "FROZEN"] } },
    select: { id: true },
  });
  const balances = await membershipBalances(
    db,
    memberships.map((m) => m.id),
  );
  const [charges, achieved, prepayments] = await Promise.all([
    db.charge.aggregate({
      where: { month: from, membership: { group: groupScope } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: {
        ...payScope,
        ...(filters.effective ? { effectiveMonth: from } : { paidAt: { gte: from, lte: to } }),
      },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { ...payScope, effectiveMonth: { gt: from }, paidAt: { lte: to } },
      _sum: { amount: true },
    }),
  ]);
  let activeDebt = 0;
  let debtors = 0;
  for (const b of balances.values()) {
    if (b.balance < 0) {
      activeDebt += -b.balance;
      debtors += 1;
    }
  }
  const plan = num(charges._sum.amount);
  const got = num(achieved._sum.amount);
  return {
    month: dateToIso(from).slice(0, 7),
    effective: filters.effective,
    plan,
    achieved: got,
    expected: Math.max(plan - got, 0),
    achievedPercent: plan > 0 ? Math.round((got / plan) * 1000) / 10 : 0,
    activeDebt: Math.round(activeDebt),
    debtors,
    prepayments: num(prepayments._sum.amount),
  };
}
