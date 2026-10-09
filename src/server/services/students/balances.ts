import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  prismaCode,
} from "@/server/services/settings/shared";

import {
  addMonthsIso,
  allocateInstalments,
  chargeAmount,
  chargeableMonths,
  countLessons,
  discountFor,
  firstUnpaidMonth,
  monthStart,
  type ChargeWindow,
  type InstalmentPart,
} from "./fees";

/*
 * Charges are created lazily (A-10): whenever a balance is needed, the months
 * due so far get their charge rows. Past months are frozen once written; the
 * current month is recomputed, so a freeze or removal mid-month is reflected.
 */

export interface MembershipBalance {
  membershipId: string;
  charged: number;
  paid: number;
  bonus: number;
  refunded: number;
  /** Opening balances and corrections, signed (A-109). */
  adjusted: number;
  balance: number;
  /** When the student's money runs out, for "Keyingi to'lov"; null when nothing is due. */
  nextPaymentDate: string | null;
  /** The month a new payment should apply to by default ("Tasir vaqti"). */
  suggestedMonth: string;
  /** "To'lov summasini avtomatik to'ldirish": the debt, or one month's price. */
  suggestedAmount: number;
  monthlyPrice: number;
  lastChargedMonth: string | null;
  discount: {
    remainingMonths: number;
    discountedPrice: number;
    percent: number;
    givenAt: string;
    comment: string | null;
    /** Set when the discount is the family's (A-123). */
    familyId: string | null;
  } | null;
  /** Unpaid parts of a split fee whose day has not come yet (A-123): owed, but not a debt today. */
  deferred: number;
  /** The parts of the split months from the first unpaid one on; empty when no fee is split. */
  instalments: InstalmentPart[];
}

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
  group: {
    select: {
      endDate: true,
      course: { select: { price: true } },
      lessons: { select: { date: true } },
    },
  },
  discounts: {
    select: {
      id: true,
      discountedPrice: true,
      months: true,
      givenAt: true,
      comment: true,
      familyId: true,
      _count: { select: { charges: true } },
    },
  },
  charges: { select: { month: true, amount: true, price: true } },
  instalments: { select: { id: true, month: true, dueDate: true, amount: true } },
} satisfies Prisma.GroupMembershipSelect;

type MembershipRow = Prisma.GroupMembershipGetPayload<{ select: typeof membershipSelect }>;

function windowOf(m: MembershipRow): ChargeWindow {
  return {
    status: m.status,
    activatedAt: m.activatedAt ? dateToIso(m.activatedAt) : null,
    joinedAt: dateToIso(m.joinedAt),
    leftAt: m.leftAt ? dateToIso(m.leftAt) : null,
    frozenAt: m.frozenAt ? dateToIso(m.frozenAt) : null,
    billingFrom: m.billingFrom ? dateToIso(m.billingFrom) : null,
  };
}

/** Writes the charge rows that are due for these memberships. Idempotent. */
export async function syncCharges(db: DbClient, membershipIds: string[]): Promise<void> {
  if (membershipIds.length === 0) return;
  const today = todayIso();
  const currentMonth = monthStart(today);
  const rows: MembershipRow[] = await db.groupMembership.findMany({
    where: { id: { in: membershipIds } },
    select: membershipSelect,
  });

  for (const m of rows) {
    const window = windowOf(m);
    const months = chargeableMonths(window, dateToIso(m.group.endDate), today);
    if (months.length === 0) continue;
    const existing = new Map(m.charges.map((c) => [dateToIso(c.month), c]));
    const lessons = m.group.lessons.map((l) => ({ date: dateToIso(l.date) }));
    const basePrice = m.customPrice
      ? decimalToNumber(m.customPrice)
      : decimalToNumber(m.group.course.price);
    const discounts = m.discounts.map((d) => ({
      id: d.id,
      discountedPrice: decimalToNumber(d.discountedPrice),
      months: d.months,
      givenAt: dateToIso(d.givenAt),
      used: d._count.charges,
    }));
    try {
      for (const month of months) {
        const row = existing.get(month);
        if (row && month !== currentMonth) continue;
        const { total, counted } = countLessons(lessons, window, month);
        let discount = null;
        if (!row) {
          discount = discountFor(discounts, month);
          if (discount) discount.used += 1;
        }
        // The current month moves with the membership until it ends; the price it
        // was charged at (and any discount) stays.
        const price = row
          ? decimalToNumber(row.price)
          : discount
            ? discount.discountedPrice
            : basePrice;
        const amount = chargeAmount(price, total, counted);
        if (row) {
          await db.charge.update({
            where: { membershipId_month: { membershipId: m.id, month: isoToDate(month) } },
            data: { lessonsTotal: total, lessonsCounted: counted, amount },
          });
        } else {
          try {
            await db.charge.create({
              data: {
                membershipId: m.id,
                month: isoToDate(month),
                price,
                amount,
                lessonsTotal: total,
                lessonsCounted: counted,
                discountId: discount?.id ?? null,
              },
            });
          } catch (error) {
            // Balances are computed on demand from many places at once (a page,
            // the daily job, a report), so another caller may have written this
            // month's row between our read and this insert. It used the same
            // inputs, so keep its row; only the moving current month is refreshed.
            if (prismaCode(error) !== "P2002") throw error;
            if (month === currentMonth) {
              await db.charge.update({
                where: { membershipId_month: { membershipId: m.id, month: isoToDate(month) } },
                data: { lessonsTotal: total, lessonsCounted: counted, amount },
              });
            }
          }
        }
      }
    } catch (error) {
      // The membership was deleted meanwhile (e.g. its group was removed); it
      // no longer has a balance, so skip it instead of failing every caller.
      const code = prismaCode(error);
      if (code !== "P2003" && code !== "P2025") throw error;
    }
  }
}

/** Balances for memberships, after syncing their charges. */
export async function membershipBalances(
  db: DbClient,
  membershipIds: string[],
): Promise<Map<string, MembershipBalance>> {
  const result = new Map<string, MembershipBalance>();
  if (membershipIds.length === 0) return result;
  await syncCharges(db, membershipIds);
  const today = todayIso();
  const currentMonth = monthStart(today);

  const [rows, payments, refunds, adjustments] = await Promise.all([
    db.groupMembership.findMany({
      where: { id: { in: membershipIds } },
      select: membershipSelect,
    }),
    db.payment.groupBy({
      by: ["membershipId"],
      where: { membershipId: { in: membershipIds } },
      _sum: { amount: true, bonus: true },
    }),
    db.refund.findMany({
      where: { payment: { membershipId: { in: membershipIds } } },
      select: { amount: true, payment: { select: { membershipId: true } } },
    }),
    db.balanceAdjustment.groupBy({
      by: ["membershipId"],
      where: { membershipId: { in: membershipIds } },
      _sum: { amount: true },
    }),
  ]);
  const adjustedBy = new Map(
    adjustments.map((a) => [a.membershipId, a._sum.amount ? decimalToNumber(a._sum.amount) : 0]),
  );
  const paidBy = new Map(
    payments.map((p) => [
      p.membershipId,
      {
        amount: p._sum.amount ? decimalToNumber(p._sum.amount) : 0,
        bonus: p._sum.bonus ? decimalToNumber(p._sum.bonus) : 0,
      },
    ]),
  );
  const refundedBy = new Map<string, number>();
  for (const r of refunds) {
    const id = r.payment.membershipId;
    refundedBy.set(id, (refundedBy.get(id) ?? 0) + decimalToNumber(r.amount));
  }

  for (const m of rows) {
    const charges = m.charges
      .map((c) => ({
        month: dateToIso(c.month),
        amount: decimalToNumber(c.amount),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const charged = charges.reduce((s, c) => s + c.amount, 0);
    const paid = paidBy.get(m.id)?.amount ?? 0;
    const bonus = paidBy.get(m.id)?.bonus ?? 0;
    const refunded = refundedBy.get(m.id) ?? 0;
    // What the student brought from the old system, or a hand correction, counts as money
    // (or debt) that exists before any charge of this membership (A-109).
    const adjusted = adjustedBy.get(m.id) ?? 0;
    const credit = paid + bonus - refunded + adjusted;
    const balance = credit - charged;
    const lastChargedMonth = charges.at(-1)?.month ?? null;
    const unpaid = firstUnpaidMonth(charges, credit);
    // A split month's parts fall due on their own days (A-123).
    const split = allocateInstalments(
      charges,
      m.instalments.map((i) => ({
        id: i.id,
        month: dateToIso(i.month),
        dueDate: dateToIso(i.dueDate),
        amount: decimalToNumber(i.amount),
      })),
      credit,
      today,
    );
    const deferred = split.deferred;
    const dueNow = Math.max(0, -(balance + deferred));
    const nextPart = split.parts.find((p) => p.remaining > 0) ?? null;
    const window = windowOf(m);
    const endMonth = monthStart(dateToIso(m.group.endDate));
    const stillCharged = window.status === "ACTIVE" || window.status === "FROZEN";
    const nextMonth = lastChargedMonth ? addMonthsIso(lastChargedMonth, 1) : currentMonth;
    const nextPaymentDate =
      balance < 0
        ? (split.firstUnpaidDate ?? split.nextDueDate ?? unpaid ?? today)
        : stillCharged && nextMonth <= endMonth
          ? nextMonth
          : null;
    const basePrice = m.customPrice
      ? decimalToNumber(m.customPrice)
      : decimalToNumber(m.group.course.price);
    const openDiscount =
      m.discounts
        .map((d) => {
          const discountedPrice = decimalToNumber(d.discountedPrice);
          return {
            remainingMonths: d.months - d._count.charges,
            discountedPrice,
            percent:
              basePrice > 0 ? Math.round(((basePrice - discountedPrice) / basePrice) * 100) : 0,
            givenAt: dateToIso(d.givenAt),
            comment: d.comment,
            familyId: d.familyId,
          };
        })
        .filter((d) => d.remainingMonths > 0)
        .sort((a, b) => a.givenAt.localeCompare(b.givenAt))[0] ?? null;
    const monthlyPrice = openDiscount ? openDiscount.discountedPrice : basePrice;
    result.set(m.id, {
      membershipId: m.id,
      charged,
      paid,
      bonus,
      refunded,
      adjusted,
      balance,
      nextPaymentDate,
      suggestedMonth: unpaid ?? (nextMonth <= endMonth ? nextMonth : currentMonth),
      suggestedAmount:
        balance < 0 ? (dueNow > 0 ? dueNow : (nextPart?.remaining ?? -balance)) : monthlyPrice,
      monthlyPrice,
      lastChargedMonth,
      discount: openDiscount,
      deferred,
      instalments: split.parts.filter((p) => p.month >= (unpaid ?? currentMonth)),
    });
  }
  return result;
}
