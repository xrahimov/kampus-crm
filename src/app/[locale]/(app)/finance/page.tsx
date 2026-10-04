import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FinancePage } from "@/features/finance/finance-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listCategories } from "@/server/services/finance/categories.service";
import { getFinanceOptions, sumEntriesByType } from "@/server/services/finance/entries.service";
import { getFinanceOverview, getFinancePlan } from "@/server/services/finance/overview.service";
import { listPayrollRuns } from "@/server/services/finance/payroll.service";

import { financeParams, yearOptions } from "./_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance");
  return { title: t("title") };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "finance.view")) return <Forbidden />;
  const f = financeParams(await searchParams);
  const period = {
    branchId: f.branchId ?? undefined,
    year: f.year,
    month: f.month ?? undefined,
    paymentMethodId: f.paymentMethodId ?? undefined,
  };
  const planMonth = f.month ?? new Date().getMonth() + 1;
  const [overview, plan, categories, totals, payroll, options] = await Promise.all([
    getFinanceOverview(current.actor, period),
    getFinancePlan(current.actor, {
      branchId: period.branchId,
      year: f.year,
      month: planMonth,
      effective: f.effective,
    }),
    listCategories(current.actor, period),
    sumEntriesByType(current.actor, period),
    listPayrollRuns(current.actor),
    getFinanceOptions(current.actor),
  ]);
  return (
    <FinancePage
      filters={f}
      overview={overview}
      plan={plan}
      categories={categories}
      staffTotals={{
        bonus: totals.BONUS,
        penalty: totals.PENALTY,
        advance: totals.ADVANCE,
        marketing: totals.MARKETING,
        investment: totals.INVESTMENT,
      }}
      payroll={payroll}
      options={options}
      branches={options.branches}
      years={yearOptions()}
      can={{ create: can(current.actor, "finance.create") }}
    />
  );
}
