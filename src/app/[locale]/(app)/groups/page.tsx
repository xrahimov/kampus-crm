import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GroupsPage } from "@/features/groups/groups-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import {
  GROUP_SORT_FIELDS,
  GROUP_STATUSES,
  WEEKDAY_PATTERNS,
  type GroupStatus,
  type WeekdayPattern,
} from "@/lib/validation/groups";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { listGroups } from "@/server/services/groups/groups.service";
import { getGroupFormOptions } from "@/server/services/groups/options.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("groups");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

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
  if (!can(current.actor, "groups.view")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: GROUP_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const rawStatus = str(sp.status);
  const status: GroupStatus | "ALL" =
    rawStatus === "ALL" || (GROUP_STATUSES as readonly string[]).includes(rawStatus ?? "")
      ? (rawStatus as GroupStatus | "ALL")
      : "ACTIVE";
  const rawPattern = str(sp.weekdayPattern);
  const weekdayPattern = (WEEKDAY_PATTERNS as readonly string[]).includes(rawPattern ?? "")
    ? (rawPattern as WeekdayPattern)
    : null;
  const filters = {
    status,
    teacherId: str(sp.teacherId),
    courseId: str(sp.courseId),
    weekdayPattern,
  };

  const [page, options] = await Promise.all([
    listGroups(current.actor, query, {
      status,
      teacherId: filters.teacherId ?? undefined,
      courseId: filters.courseId ?? undefined,
      weekdayPattern: weekdayPattern ?? undefined,
    }),
    getGroupFormOptions(current.actor),
  ]);

  return (
    <GroupsPage
      page={page}
      filters={filters}
      options={options}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      can={{
        create: can(current.actor, "groups.create"),
        update: can(current.actor, "groups.update"),
        delete: can(current.actor, "groups.delete"),
        sms: can(current.actor, "sms.send"),
      }}
    />
  );
}
