import type { FinancePeriod } from "@/lib/validation/finance";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import {
  getFinanceOverview,
  type FinanceOverviewDto,
} from "@/server/services/finance/overview.service";

/**
 * EXP §1 finance section: the same figures as Finance → overview, opened by
 * `dashboard.finance` (A-96) rather than `finance.view`, so a branch manager who
 * sees the dashboard cards needs no access to the ledger itself.
 */
export async function getDashboardFinance(
  actor: Actor,
  period: FinancePeriod,
  db: DbClient = prisma,
): Promise<FinanceOverviewDto> {
  authorize(actor, "dashboard.finance");
  const reader: Actor = { ...actor, permissions: [...actor.permissions, "finance.view"] };
  return getFinanceOverview(reader, period, db);
}

export interface DashboardFinanceOptions {
  paymentMethods: Array<{ id: string; name: string }>;
  years: number[];
}

/** Filter options for the dashboard finance section (payment types, years with data). */
export async function getDashboardFinanceOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<DashboardFinanceOptions> {
  authorize(actor, "dashboard.finance");
  const [methods, first] = await Promise.all([
    db.paymentMethod.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.payment.findFirst({ orderBy: { paidAt: "asc" }, select: { paidAt: true } }),
  ]);
  const now = new Date().getUTCFullYear();
  const start = first ? first.paidAt.getUTCFullYear() : now;
  const years: number[] = [];
  for (let y = now + 1; y >= Math.min(start, now); y -= 1) years.push(y);
  return { paymentMethods: methods, years };
}
