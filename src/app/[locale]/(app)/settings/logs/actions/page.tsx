import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { ActionLogPage } from "@/features/settings/logs/action-log-page";
import { actionLogFilterSchema } from "@/lib/validation/integrations";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import {
  ACTION_LOG_SORT_FIELDS,
  listActionLog,
  listActionLogActors,
} from "@/server/services/logs/logs.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("actions") };
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
  if (!can(current.actor, "logs.view")) return <Forbidden />;
  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: ACTION_LOG_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const parsed = actionLogFilterSchema.safeParse({
    entity: str(sp.entity),
    actorId: str(sp.actorId),
    from: str(sp.from),
    to: str(sp.to),
  });
  const filters = parsed.success ? parsed.data : {};
  const [page, actors] = await Promise.all([
    listActionLog(current.actor, query, filters),
    listActionLogActors(current.actor),
  ]);
  return <ActionLogPage page={page} filters={filters} actors={actors} />;
}
