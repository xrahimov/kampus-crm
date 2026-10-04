import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { TeachersPage } from "@/features/staff/teachers-page";
import { STAFF_SORT_FIELDS, TEACHER_KINDS, type TeacherKind } from "@/lib/validation/staff";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { listRoles } from "@/server/services/staff/roles.service";
import { listTeachers } from "@/server/services/staff/teachers.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("teachers");
  return { title: t("title") };
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
  if (!can(current.actor, "teachers.view")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const tab = typeof sp.tab === "string" ? sp.tab : "teachers";
  const kind: TeacherKind = (TEACHER_KINDS as readonly string[]).includes(tab)
    ? (tab as TeacherKind)
    : "teachers";
  const archived = sp.archived === "true";
  const [page, roles] = await Promise.all([
    listTeachers(current.actor, query, { kind, archived }),
    listRoles(current.actor),
  ]);

  return (
    <TeachersPage
      page={page}
      kind={kind}
      archived={archived}
      roles={roles}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      selfId={current.user.id}
      canCreate={can(current.actor, "teachers.create")}
      canUpdate={can(current.actor, "teachers.update")}
      canDelete={can(current.actor, "teachers.delete")}
      canSms={can(current.actor, "sms.send")}
    />
  );
}
