import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AnnouncementsPage } from "@/features/announcements/announcements-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { ANNOUNCEMENT_SORT_FIELDS, announcementFilterSchema } from "@/lib/validation/announcements";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import {
  announcementGroupOptions,
  listAnnouncements,
} from "@/server/services/announcements/announcements.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("announcements");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/announcements": notices to a group, a branch or the whole centre (A-129). */
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
  if (!can(current.actor, "announcements.view")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: ANNOUNCEMENT_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const parsed = announcementFilterSchema.safeParse({ audience: str(sp.audience) });
  const filters = parsed.success ? parsed.data : {};
  const canCreate = can(current.actor, "announcements.create");
  const [list, groups] = await Promise.all([
    listAnnouncements(current.actor, query, filters),
    canCreate ? announcementGroupOptions(current.actor) : [],
  ]);

  return (
    <AnnouncementsPage
      list={list}
      filters={filters}
      branches={current.branches}
      groups={groups}
      canCreate={canCreate}
      canCentre={canAccessAllBranches(current.actor)}
    />
  );
}
