import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { TeacherDetail } from "@/features/staff/teacher-detail";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { listRoles } from "@/server/services/staff/roles.service";
import { getTeacher } from "@/server/services/staff/teachers.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "teachers.view")) return {};
  try {
    return { title: (await getTeacher(current.actor, id)).fullName };
  } catch {
    return {};
  }
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "teachers.view")) return <Forbidden />;

  let teacher;
  try {
    teacher = await getTeacher(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const roles = await listRoles(current.actor);
  const branches = canAccessAllBranches(current.actor)
    ? current.branches
    : current.branches.filter((b) => current.actor.branchIds.includes(b.id));

  return (
    <TeacherDetail
      teacher={teacher}
      roles={roles}
      branches={branches}
      selfId={current.user.id}
      canUpdate={can(current.actor, "teachers.update")}
    />
  );
}
