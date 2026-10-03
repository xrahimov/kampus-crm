import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { StaffPage } from "@/features/settings/staff/staff-page";
import { STAFF_SORT_FIELDS } from "@/lib/validation/staff";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { listRoles } from "@/server/services/staff/roles.service";
import { countStaffByRole, listStaff } from "@/server/services/staff/staff.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("staff") };
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
  if (!can(current.actor, "staff.view")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const roleCode = typeof sp.role === "string" && sp.role ? sp.role : null;
  const archived = sp.archived === "true";
  const [page, roleCounts, roles] = await Promise.all([
    listStaff(current.actor, "staff", query, { roleCode: roleCode ?? undefined, archived }),
    countStaffByRole(current.actor, archived),
    listRoles(current.actor),
  ]);

  return (
    <StaffPage
      page={page}
      roleCounts={roleCounts}
      roleCode={roleCode}
      archived={archived}
      roles={roles}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      selfId={current.user.id}
      canUpdate={can(current.actor, "staff.update")}
      canDelete={can(current.actor, "staff.delete")}
    />
  );
}
