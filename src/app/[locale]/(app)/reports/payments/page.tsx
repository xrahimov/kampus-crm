import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PaymentsReport } from "@/features/reports/payments-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import {
  PAYMENTS_REPORT_TABS,
  reportPeriodSchema,
  type PaymentsReportTab,
} from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getPaymentsReport } from "@/server/services/reports/payments-report.service";

import { pick, str } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("payments") };
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
  if (!can(current.actor, "reports.payments")) return <Forbidden />;
  const sp = await searchParams;
  const parsed = reportPeriodSchema.safeParse(pick(sp, ["branchId", "year", "month"]));
  const tabRaw = str(sp.tab) ?? "teachers";
  const tab: PaymentsReportTab = (PAYMENTS_REPORT_TABS as readonly string[]).includes(tabRaw)
    ? (tabRaw as PaymentsReportTab)
    : "teachers";
  const report = await getPaymentsReport(current.actor, parsed.success ? parsed.data : {});
  return <PaymentsReport report={report} tab={tab} branches={current.branches} />;
}
