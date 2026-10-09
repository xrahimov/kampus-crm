import type { MembershipStatus } from "@/lib/validation/groups";

/*
 * The fee engine (A-10): pure functions over "YYYY-MM-DD" strings, so they
 * can be unit-tested without a database. A membership is charged the monthly
 * price for every course month from the day it became ACTIVE, pro-rated by the
 * lessons it is actually in (joined, not yet left, not frozen).
 */

export interface LessonLike {
  date: string;
}

export interface ChargeWindow {
  status: MembershipStatus;
  /** Charged from here: the activation date, or the join date for members created active. */
  activatedAt: string | null;
  joinedAt: string;
  leftAt: string | null;
  frozenAt: string | null;
  /** A chosen "charged from" day that overrides the activation date (A-110). */
  billingFrom?: string | null;
}

/** "YYYY-MM-DD" → the first day of its month. */
export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonthsIso(monthIso: string, count: number): string {
  const [y, m] = monthIso.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + count;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** First days of every month from `from` to `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = monthStart(from); m <= monthStart(to); m = addMonthsIso(m, 1)) months.push(m);
  return months;
}

export const CHARGED_STATUSES: readonly MembershipStatus[] = [
  "ACTIVE",
  "FROZEN",
  "ARCHIVED",
  "GRADUATED",
];

/** The day charging starts, or null while the student is NEW or TRIAL. */
export function chargedFrom(window: ChargeWindow): string | null {
  if (!CHARGED_STATUSES.includes(window.status)) return null;
  return window.billingFrom ?? window.activatedAt ?? window.joinedAt;
}

/** Lessons of one month, and how many of them the student is charged for. */
export function countLessons(
  lessons: LessonLike[],
  window: ChargeWindow,
  month: string,
): { total: number; counted: number } {
  const from = chargedFrom(window);
  const end = addMonthsIso(month, 1);
  let total = 0;
  let counted = 0;
  for (const lesson of lessons) {
    if (lesson.date < month || lesson.date >= end) continue;
    total += 1;
    if (from === null || lesson.date < from) continue;
    if (window.leftAt !== null && lesson.date >= window.leftAt) continue;
    if (window.frozenAt !== null && lesson.date >= window.frozenAt) continue;
    counted += 1;
  }
  return { total, counted };
}

/** Pro-rated monthly fee, rounded to whole soʻm. */
export function chargeAmount(price: number, total: number, counted: number): number {
  if (total === 0 || counted === 0) return 0;
  return Math.round((price * counted) / total);
}

export interface DiscountLike {
  id: string;
  discountedPrice: number;
  months: number;
  givenAt: string;
  used: number;
}

/**
 * The discount that covers `month`: given on or before that month and with
 * months left, the earliest first. Discounts do not stack.
 */
export function discountFor(discounts: DiscountLike[], month: string): DiscountLike | null {
  const open = discounts
    .filter((d) => d.used < d.months && monthStart(d.givenAt) <= month)
    .sort((a, b) => a.givenAt.localeCompare(b.givenAt));
  return open[0] ?? null;
}

/** Course months that should carry a charge by `today`: activation month to the earlier of today and the course end. */
export function chargeableMonths(
  window: ChargeWindow,
  groupEndDate: string,
  today: string,
): string[] {
  const from = chargedFrom(window);
  if (from === null) return [];
  const last = groupEndDate < today ? groupEndDate : today;
  if (window.leftAt !== null && window.leftAt < last) {
    // A member who left is charged through the month they left in.
    const leftMonth = monthStart(window.leftAt);
    return from <= window.leftAt ? monthsBetween(from, leftMonth) : [];
  }
  if (monthStart(from) > monthStart(last)) return [];
  return monthsBetween(from, last);
}

/**
 * Where the student's money runs out: the month of the first charge that the
 * payments no longer cover, or null when everything charged is paid.
 */
export function firstUnpaidMonth(
  charges: Array<{ month: string; amount: number }>,
  paid: number,
): string | null {
  let running = paid;
  for (const charge of [...charges].sort((a, b) => a.month.localeCompare(b.month))) {
    running -= charge.amount;
    if (running < 0) return charge.month;
  }
  return null;
}

/* ----- Instalments (A-123) ------------------------------------------------------- */

export interface InstalmentLike {
  id: string;
  /** "YYYY-MM-01": the charged month this part belongs to. */
  month: string;
  dueDate: string;
  amount: number;
}

export interface InstalmentPart extends InstalmentLike {
  /** What is still unpaid of this part once the credit is applied in order. */
  remaining: number;
  paid: boolean;
}

export interface InstalmentAllocation {
  /** The parts of every split month, charged or still planned, in month and due-day order. */
  parts: InstalmentPart[];
  /** Unpaid money whose day has not come yet: owed, but not a debt today. */
  deferred: number;
  /** The day the first unpaid charge or part was due, or null when nothing due is unpaid. */
  firstUnpaidDate: string | null;
  /** The day the earliest unpaid part not yet due falls on, or null. */
  nextDueDate: string | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Applies the credit to the charges in month order and, inside a month that was
 * split, to its parts in due-day order. The parts schedule the charge: what they
 * do not add up to is due with the month, and a part is a debt only once its day
 * has passed. The parts of a split month that is not charged yet are planned, not
 * owed: they are listed, with whatever credit is left applied to them in order,
 * but count towards nothing.
 */
export function allocateInstalments(
  charges: Array<{ month: string; amount: number }>,
  instalments: InstalmentLike[],
  credit: number,
  today: string,
): InstalmentAllocation {
  const byMonth = new Map<string, InstalmentLike[]>();
  for (const part of instalments) {
    const list = byMonth.get(part.month) ?? [];
    list.push(part);
    byMonth.set(part.month, list);
  }
  const parts: InstalmentPart[] = [];
  let deferred = 0;
  let firstUnpaidDate: string | null = null;
  let nextDueDate: string | null = null;
  let running = credit;
  const unpaidOn = (date: string) => {
    if (firstUnpaidDate === null || date < firstUnpaidDate) firstUnpaidDate = date;
  };
  for (const charge of [...charges].sort((a, b) => a.month.localeCompare(b.month))) {
    const split = (byMonth.get(charge.month) ?? []).sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
    let left = charge.amount;
    for (const part of split) {
      const amount = Math.max(0, Math.min(part.amount, left));
      left -= amount;
      const covered = Math.max(0, Math.min(amount, running));
      running -= amount;
      const remaining = round2(amount - covered);
      parts.push({ ...part, amount, remaining, paid: remaining <= 0 });
      if (remaining <= 0) continue;
      if (part.dueDate > today) {
        deferred += remaining;
        if (nextDueDate === null || part.dueDate < nextDueDate) nextDueDate = part.dueDate;
      } else {
        unpaidOn(part.dueDate);
      }
    }
    if (left > 0) {
      const covered = Math.max(0, Math.min(left, running));
      running -= left;
      if (round2(left - covered) > 0) unpaidOn(charge.month);
    }
  }
  const charged = new Set(charges.map((c) => c.month));
  for (const month of [...byMonth.keys()].filter((m) => !charged.has(m)).sort()) {
    const split = [...byMonth.get(month)!].sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id),
    );
    for (const part of split) {
      const covered = Math.max(0, Math.min(part.amount, running));
      running -= part.amount;
      const remaining = round2(part.amount - covered);
      parts.push({ ...part, remaining, paid: remaining <= 0 });
    }
  }
  return { parts, deferred: round2(deferred), firstUnpaidDate, nextDueDate };
}
