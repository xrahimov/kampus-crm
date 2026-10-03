import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { SchoolsPage } from "@/features/settings/schools/schools-page";
import { can } from "@/server/rbac/authorize";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listSchools, SCHOOL_SORT_FIELDS } from "@/server/services/settings/schools.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("schools") };
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
    sortable: SCHOOL_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const page = await listSchools(current.actor, query);
  return <SchoolsPage page={page} />;
}
