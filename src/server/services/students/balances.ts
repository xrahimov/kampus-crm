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
  chargeAmount,
  chargeableMonths,
  countLessons,
  discountFor,
  firstUnpaidMonth,
  monthStart,
  type ChargeWindow,
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
    givenAt: string;
    comment: string | null;
  } | null;
}

const todayIso = () => dateToIso(new Date());

const membershipSelect = {
  id: true,
  status: true,
  joinedAt: true,
  leftAt: true,
  activatedAt: true,
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
      _count: { select: { charges: true } },
    },
  },
  charges: { select: { month: true, amount: true } },
} satisfies Prisma.GroupMembershipSelect;

type MembershipRow = Prisma.GroupMembershipGetPayload<{ select: typeof membershipSelect }>;

function windowOf(m: MembershipRow): ChargeWindow {
  return {
    status: m.status,
    activatedAt: m.activatedAt ? dateToIso(m.activatedAt) : null,
    joinedAt: dateToIso(m.joinedAt),
    leftAt: m.leftAt ? dateToIso(m.leftAt) : null,
    frozenAt: m.frozenAt ? dateToIso(m.frozenAt) : null,
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
        const has = existing.has(month);
        if (has && month !== currentMonth) continue;
        const { total, counted } = countLessons(lessons, window, month);
        let discount = null;
        if (!has) {
          discount = discountFor(discounts, month);
          if (discount) discount.used += 1;
        }
        const price = discount ? discount.discountedPrice : basePrice;
        const amount = chargeAmount(price, total, counted);
        if (has) {
          // The current month moves with the membership until it ends; the price it
          // was charged at (and any discount) stays.
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

  const [rows, payments, refunds] = await Promise.all([
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
  ]);
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
    const credit = paid + bonus - refunded;
    const balance = credit - charged;
    const lastChargedMonth = charges.at(-1)?.month ?? null;
    const unpaid = firstUnpaidMonth(charges, credit);
    const window = windowOf(m);
    const endMonth = monthStart(dateToIso(m.group.endDate));
    const stillCharged = window.status === "ACTIVE" || window.status === "FROZEN";
    const nextMonth = lastChargedMonth ? addMonthsIso(lastChargedMonth, 1) : currentMonth;
    const nextPaymentDate =
      balance < 0 ? (unpaid ?? today) : stillCharged && nextMonth <= endMonth ? nextMonth : null;
    const basePrice = m.customPrice
      ? decimalToNumber(m.customPrice)
      : decimalToNumber(m.group.course.price);
    const openDiscount =
      m.discounts
        .map((d) => ({
          remainingMonths: d.months - d._count.charges,
          discountedPrice: decimalToNumber(d.discountedPrice),
          givenAt: dateToIso(d.givenAt),
          comment: d.comment,
        }))
        .filter((d) => d.remainingMonths > 0)
        .sort((a, b) => a.givenAt.localeCompare(b.givenAt))[0] ?? null;
    const monthlyPrice = openDiscount ? openDiscount.discountedPrice : basePrice;
    result.set(m.id, {
      membershipId: m.id,
      charged,
      paid,
      bonus,
      refunded,
      balance,
      nextPaymentDate,
      suggestedMonth: unpaid ?? (nextMonth <= endMonth ? nextMonth : currentMonth),
      suggestedAmount: balance < 0 ? -balance : monthlyPrice,
      monthlyPrice,
      lastChargedMonth,
      discount: openDiscount,
    });
  }
  return result;
}
