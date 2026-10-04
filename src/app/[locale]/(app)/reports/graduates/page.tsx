import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GraduatesReport } from "@/features/reports/graduates-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { graduatesFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getGraduatesReport } from "@/server/services/reports/graduates.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("graduates") };
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
  const parsed = graduatesFilterSchema.safeParse(
    pick(sp, ["branchId", "year", "month", "groupId", "teacherId", "courseId", "result"]),
  );
  const filters = parsed.success ? parsed.data : {};
  const report = await getGraduatesReport(current.actor, filters);
  return (
    <GraduatesReport
      report={report}
      filters={filters}
      branches={current.branches}
      canRecord={can(current.actor, "students.update")}
    />
  );
}
