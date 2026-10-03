import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DaysOffPage } from "@/features/settings/days-off/days-off-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { can } from "@/server/rbac/authorize";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listBranches } from "@/server/services/settings/branches.service";
import { DAY_OFF_SORT_FIELDS, listDaysOff } from "@/server/services/settings/days-off.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("daysOff") };
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
    sortable: DAY_OFF_SORT_FIELDS,
    defaultSort: { field: "date", direction: "desc" },
  });
  const [page, branches] = await Promise.all([
    listDaysOff(current.actor, query),
    listBranches(current.actor),
  ]);

  return (
    <DaysOffPage
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
