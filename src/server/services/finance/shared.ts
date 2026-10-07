import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors/app-error";
import { branchScope, type Actor } from "@/server/rbac/authorize";
import { isoToDate } from "@/server/services/settings/shared";

/** First and last day of a month (or a whole year) as Dates for @db.Date filters. */
export function periodRange(year: number, month?: number): { from: Date; to: Date } {
  const m = month ?? 1;
  const from = isoToDate(`${year}-${String(m).padStart(2, "0")}-01`);
  const to = month ? new Date(Date.UTC(year, month, 0)) : isoToDate(`${year}-12-31`);
  return { from, to };
}

export function monthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The branches a finance query may touch: the chosen one (checked) or the actor's scope. */
export function financeBranch(actor: Actor, branchId?: string): Prisma.FinanceEntryWhereInput {
  if (branchId) {
    if (!actor.branchIds.includes(branchId)) {
      throw AppError.forbidden("errors.branchForbidden");
    }
    return { branchId };
  }
  return branchScope(actor);
}

export function assertBranch(actor: Actor, branchId: string): void {
  if (!actor.branchIds.includes(branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
}
