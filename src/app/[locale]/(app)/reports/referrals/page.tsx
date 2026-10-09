import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ReferralsReport } from "@/features/reports/referrals-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { referralsReportFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getReferralsReport } from "@/server/services/students/referrals.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("referrals") };
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
  const parsed = referralsReportFilterSchema.safeParse(pick(sp, ["branchId", "year", "month"]));
  const filters = parsed.success ? parsed.data : {};
  const report = await getReferralsReport(current.actor, filters);
  return <ReferralsReport report={report} filters={filters} branches={current.branches} />;
}
