import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { RoomsPage } from "@/features/settings/rooms/rooms-page";
import { can } from "@/server/rbac/authorize";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listBranches } from "@/server/services/settings/branches.service";
import { listRooms, ROOM_SORT_FIELDS } from "@/server/services/settings/rooms.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("rooms") };
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

  const query = listFromSearchParams(await searchParams, {
    sortable: ROOM_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const [page, branches] = await Promise.all([
    listRooms(current.actor, query),
    listBranches(current.actor),
  ]);

  return (
    <RoomsPage
      page={page}
      branches={branches.filter((b) => b.isActive)}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={
        current.actor.permissions.includes("*") ||
        current.actor.permissions.includes("settings.org")
      }
    />
  );
}
