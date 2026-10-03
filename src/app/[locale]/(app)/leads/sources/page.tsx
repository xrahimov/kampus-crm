import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SourcesPage } from "@/features/leads/sources-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { sourceStatsSchema } from "@/lib/validation/leads";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listSources } from "@/server/services/leads/sources.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.sourcesPage");
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
  if (!can(current.actor, "leads.view")) return <Forbidden />;
  const sp = await searchParams;
  const parsed = sourceStatsSchema.safeParse({ from: str(sp.from), to: str(sp.to) });
  const filters = parsed.success ? parsed.data : {};
  const sources = await listSources(current.actor, filters);
  return (
    <SourcesPage
      sources={sources}
      filters={filters}
      can={{
        update: can(current.actor, "leads.update"),
        delete: can(current.actor, "leads.delete"),
      }}
    />
  );
}
