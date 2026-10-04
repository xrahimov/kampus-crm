import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StudentsReport } from "@/features/reports/students-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import {
  STUDENTS_REPORT_TABS,
  studentsReportFilterSchema,
  type StudentsReportTab,
} from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { monthPeriod } from "@/server/services/reports/shared";
import { getStudentsReport } from "@/server/services/reports/students-report.service";

import { pick, str } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("students") };
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
  const parsed = studentsReportFilterSchema.safeParse(
    pick(sp, ["branchId", "year", "month", "from", "to", "groupId", "teacherId", "status", "page"]),
  );
  const filters = parsed.success ? parsed.data : {};
  const tabRaw = str(sp.tab) ?? "attendance";
  const tab: StudentsReportTab = (STUDENTS_REPORT_TABS as readonly string[]).includes(tabRaw)
    ? (tabRaw as StudentsReportTab)
    : "attendance";
  const period = monthPeriod(filters.year, filters.month);
  const report = await getStudentsReport(current.actor, filters);
  return (
    <StudentsReport
      report={report}
      filters={filters}
      tab={tab}
      branches={current.branches}
      year={period.year}
      month={period.month}
    />
  );
}
