import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CoursesPage } from "@/features/settings/courses/courses-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { can } from "@/server/rbac/authorize";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listBranches } from "@/server/services/settings/branches.service";
import { COURSE_SORT_FIELDS, listCourses } from "@/server/services/settings/courses.service";
import { listGradingSystems } from "@/server/services/settings/grading-systems.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("courses") };
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
  if (!can(current.actor, "settings.catalog")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: COURSE_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const archived = sp.archived === "true";
  const [page, branches, gradingSystems] = await Promise.all([
    listCourses(current.actor, query, { archived }),
    listBranches(current.actor),
    listGradingSystems(current.actor),
  ]);

  return (
    <CoursesPage
      page={page}
      archived={archived}
      branches={branches.filter((b) => b.isActive)}
      gradingSystems={gradingSystems}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={
        current.actor.permissions.includes("*") ||
        current.actor.permissions.includes("settings.org")
      }
    />
  );
}
