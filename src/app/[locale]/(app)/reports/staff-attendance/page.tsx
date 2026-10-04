import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StaffAttendanceReport } from "@/features/reports/staff-attendance-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import {
  STAFF_ATTENDANCE_TABS,
  staffAttendanceFilterSchema,
  type StaffAttendanceTab,
} from "@/lib/validation/integrations";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getStaffAttendanceReport } from "@/server/services/attendance/staff-attendance.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("staffAttendance") };
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
  if (!can(current.actor, "reports.view")) return <Forbidden />;
  const sp = await searchParams;
  const tabRaw = str(sp.tab) ?? "daily";
  const tab: StaffAttendanceTab = (STAFF_ATTENDANCE_TABS as readonly string[]).includes(tabRaw)
    ? (tabRaw as StaffAttendanceTab)
    : "daily";
  const parsed = staffAttendanceFilterSchema.safeParse({
    year: str(sp.year),
    month: str(sp.month),
    branchId: str(sp.branchId),
    date: str(sp.date),
  });
  const filters = parsed.success ? parsed.data : {};
  const report = await getStaffAttendanceReport(current.actor, filters);
  return (
    <StaffAttendanceReport
      report={report}
      tab={tab}
      branches={current.branches}
      canEdit={can(current.actor, "staff.update")}
    />
  );
}
