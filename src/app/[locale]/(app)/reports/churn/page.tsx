import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ChurnReport } from "@/features/reports/churn-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { churnFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getChurnOptions, getChurnReport } from "@/server/services/reports/churn.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("churn") };
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
  const parsed = churnFilterSchema.safeParse(
    pick(sp, ["from", "to", "branchId", "courseId", "teacherId", "groupId", "reason", "discount"]),
  );
  const filters = parsed.success ? parsed.data : {};
  const [report, options] = await Promise.all([
    getChurnReport(current.actor, filters),
    getChurnOptions(current.actor, filters.branchId),
  ]);
  return (
    <ChurnReport
      report={report}
      filters={filters}
      branches={current.branches}
      options={options}
      canManageReasons={can(current.actor, "settings.catalog")}
    />
  );
}
