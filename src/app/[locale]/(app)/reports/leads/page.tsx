import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LeadsReport } from "@/features/reports/leads-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { leadsReportFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getLeadsReport } from "@/server/services/reports/leads-report.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("leads") };
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
  if (!can(current.actor, "reports.leads")) return <Forbidden />;
  const sp = await searchParams;
  const parsed = leadsReportFilterSchema.safeParse(
    pick(sp, ["branchId", "year", "month", "sourceId"]),
  );
  const filters = parsed.success ? parsed.data : {};
  const report = await getLeadsReport(current.actor, filters);
  return <LeadsReport report={report} filters={filters} branches={current.branches} />;
}
