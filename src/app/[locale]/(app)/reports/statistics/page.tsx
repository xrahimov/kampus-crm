import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StatisticsReport } from "@/features/reports/statistics-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { statisticsFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getCenterStatistics } from "@/server/services/reports/statistics.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("statistics") };
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
  if (!can(current.actor, "reports.view")) return <Forbidden />;
  const sp = await searchParams;
  const parsed = statisticsFilterSchema.safeParse(
    pick(sp, ["branchId", "year", "month", "view", "date"]),
  );
  const filters = parsed.success ? parsed.data : {};
  const report = await getCenterStatistics(current.actor, filters);
  return (
    <StatisticsReport
      report={report}
      filters={filters}
      branches={current.branches}
      canEditRooms={can(current.actor, "settings.catalog")}
    />
  );
}
