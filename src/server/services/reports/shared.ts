import { AppError } from "@/server/errors/app-error";
import { branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { dateToIso, decimalToNumber, isoToDate } from "@/server/services/settings/shared";

/* Helpers shared by the Hisobotlar pages (EXP §10). */

export interface Period {
  year: number;
  month: number;
  /** First day of the month, inclusive. */
  from: Date;
  /** Last day of the month, inclusive. */
  to: Date;
  /** Same bounds for the month before, for the "% change" badges. */
  previous: { from: Date; to: Date };
}

/** The chosen month (default: this month, Tashkent time), with the previous month beside it. */
export function monthPeriod(year?: number, month?: number): Period {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return {
    year: y,
    month: m,
    from,
    to,
    previous: { from: new Date(Date.UTC(y, m - 2, 1)), to: new Date(Date.UTC(y, m - 1, 0)) },
  };
}

/** A branch filter the actor may use: the chosen branch (checked) or their whole scope. */
export function reportBranch(
  actor: Actor,
  branchId?: string,
): { branchId: string } | { branchId: { in: string[] } } | Record<string, never> {
  if (branchId) {
    if (!canAccessAllBranches(actor) && !actor.branchIds.includes(branchId)) {
      throw AppError.forbidden("errors.branchForbidden");
    }
    return { branchId };
  }
  return branchScope(actor) ?? {};
}

/** `branchId` of a `reportBranch` result as a relation filter on any model with a `branchId`. */
export function branchIn(
  scope: ReturnType<typeof reportBranch>,
): { branchId: string } | { branchId: { in: string[] } } | Record<string, never> {
  return scope;
}

export const num = (v: { toString(): string } | null | undefined) => (v ? decimalToNumber(v) : 0);

/** Percent change between two amounts; null when there is nothing to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** "YYYY-MM" of a date. */
export const monthKey = (d: Date) => dateToIso(d).slice(0, 7);

export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** Whole months between two dates (joined → left), at least 0. */
export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  return Math.max(0, months + (to.getUTCDate() >= from.getUTCDate() ? 0 : -1));
}

export function countBy<T>(
  items: T[],
  key: (item: T) => string | null | undefined,
): Array<{ name: string; count: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item) ?? "";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export { dateToIso, isoToDate };
