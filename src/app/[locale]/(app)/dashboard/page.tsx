import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DashboardPage, type DashboardFilters } from "@/features/dashboard/dashboard-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import {
  dashboardFinanceSchema,
  dashboardKpiSchema,
  scheduleSchema,
} from "@/lib/validation/dashboard";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import {
  getDashboardFinance,
  getDashboardFinanceOptions,
} from "@/server/services/dashboard/finance.service";
import { getDashboardKpis } from "@/server/services/dashboard/kpis.service";
import { getDashboardSchedule } from "@/server/services/dashboard/schedule.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

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
  if (!can(current.actor, "dashboard.view")) return <Forbidden />;
  const sp = await searchParams;
  const kpiFilters = dashboardKpiSchema.safeParse({ branchId: str(sp.branchId) });
  const branchId = kpiFilters.success ? kpiFilters.data.branchId : undefined;
  const scheduleFilters = scheduleSchema.safeParse({
    branchId,
    weekday: str(sp.weekday),
    step: str(sp.step) ?? 30,
  });
  const now = new Date();
  const financeParsed = dashboardFinanceSchema.safeParse({
    branchId,
    year: str(sp.year) ?? String(now.getUTCFullYear()),
    month: str(sp.month),
    paymentMethodId: str(sp.paymentMethodId),
  });
  const financePeriod = financeParsed.success
    ? financeParsed.data
    : { branchId, year: now.getUTCFullYear() };
  const canFinance = can(current.actor, "dashboard.finance");
  const [kpis, schedule, finance, financeOptions] = await Promise.all([
    getDashboardKpis(current.actor, { branchId }),
    getDashboardSchedule(
      current.actor,
      scheduleFilters.success ? scheduleFilters.data : { branchId, step: 30 },
    ),
    canFinance ? getDashboardFinance(current.actor, financePeriod) : null,
    canFinance ? getDashboardFinanceOptions(current.actor) : null,
  ]);
  const filters: DashboardFilters = {
    branchId,
    year: financePeriod.year,
    month: financePeriod.month,
    paymentMethodId: financePeriod.paymentMethodId,
  };
  return (
    <DashboardPage
      userName={current.user.fullName}
      kpis={kpis}
      schedule={schedule}
      finance={finance}
      financeOptions={financeOptions}
      filters={filters}
      branches={current.branches}
      canReports={can(current.actor, "reports.view")}
    />
  );
}
