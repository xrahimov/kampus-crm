import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ChurnReport } from "@/features/reports/churn-report";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { churnFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { can } from "@/server/rbac/authorize";
import { getChurnReport } from "@/server/services/reports/churn.service";
import { branchIn, reportBranch } from "@/server/services/reports/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

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
  const scope = branchIn(reportBranch(current.actor, filters.branchId));
  const [report, courses, teachers, groups] = await Promise.all([
    getChurnReport(current.actor, filters),
    prisma.course.findMany({
      where: scope,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        isArchived: false,
        roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.group.findMany({
      where: scope,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <ChurnReport
      report={report}
      filters={filters}
      branches={current.branches}
      options={{ courses, teachers: teachers.map((x) => ({ id: x.id, name: x.fullName })), groups }}
      canManageReasons={can(current.actor, "settings.catalog")}
    />
  );
}
