import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { StudentsPage } from "@/features/students/students-page";
import { STUDENT_SORT_FIELDS, studentFilterSchema } from "@/lib/validation/students";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { getStudentOptions, listStudents } from "@/server/services/students/students.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("students");
  return { title: t("title") };
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
  if (!can(current.actor, "students.view")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: STUDENT_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const parsed = studentFilterSchema.safeParse({
    archived: str(sp.archived),
    courseId: str(sp.courseId),
    schoolId: str(sp.schoolId),
    groupId: str(sp.groupId),
    teacherId: str(sp.teacherId),
    groupStatus: str(sp.groupStatus),
    paymentStatus: str(sp.paymentStatus),
  });
  const filters = parsed.success ? parsed.data : {};
  const [page, options] = await Promise.all([
    listStudents(current.actor, query, filters),
    getStudentOptions(current.actor),
  ]);

  return (
    <StudentsPage
      page={page}
      filters={filters}
      options={options}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      can={{
        create: can(current.actor, "students.create"),
        update: can(current.actor, "students.update"),
        delete: can(current.actor, "students.delete"),
        blacklist: can(current.actor, "students.blacklist"),
      }}
    />
  );
}
