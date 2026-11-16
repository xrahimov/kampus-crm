import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { JoinRequestsPage } from "@/features/join-requests/join-requests-page";
import { Forbidden } from "@/features/settings/forbidden";
import { JOIN_REQUEST_TABS, type JoinRequestTab } from "@/lib/validation/sign-in";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { joinDoorsFor, listJoinRequests } from "@/server/services/sign-in/join-requests.service";
import { listRoles } from "@/server/services/staff/roles.service";
import { getStudentOptions } from "@/server/services/students/students.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("joinRequests");
  return { title: t("title") };
}

/**
 * `/join-requests`: people who signed in with Telegram before the centre had
 * their number (A-196). Whoever may add students or staff lets them in here.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const doors = await joinDoorsFor(current.actor);
  if (doors.length === 0) return <Forbidden />;

  const asked = (await searchParams).status ?? "";
  const tab = (JOIN_REQUEST_TABS as readonly string[]).includes(asked)
    ? (asked as JoinRequestTab)
    : "PENDING";
  const [list, groups, roles] = await Promise.all([
    listJoinRequests(current.actor, tab),
    doors.includes("STUDENT") && can(current.actor, "students.view")
      ? getStudentOptions(current.actor).then((o) =>
          o.groups
            .filter((g) => g.status !== "ARCHIVED")
            .map((g) => ({ id: g.id, name: g.name, branchId: g.branchId })),
        )
      : [],
    doors.includes("STAFF") && can(current.actor, "staff.view")
      ? listRoles(current.actor).then((rows) =>
          rows.filter((r) => r.isActive).map((r) => ({ code: r.code, name: r.name })),
        )
      : [],
  ]);

  return (
    <JoinRequestsPage
      tab={tab}
      items={list.items}
      branches={current.branches.filter((b) => current.actor.branchIds.includes(b.id))}
      groups={groups}
      roles={roles}
      canLink={can(current.actor, "students.update")}
    />
  );
}
