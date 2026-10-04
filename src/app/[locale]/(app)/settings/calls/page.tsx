import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CallsPage } from "@/features/settings/calls/calls-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { callFilterSchema } from "@/lib/validation/integrations";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { CALL_SORT_FIELDS, listCalls } from "@/server/services/calls/calls.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("calls") };
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
    sortable: CALL_SORT_FIELDS,
    defaultSort: { field: "startedAt", direction: "desc" },
  });
  const parsed = callFilterSchema.safeParse({
    direction: str(sp.direction),
    status: str(sp.status),
    from: str(sp.from),
    to: str(sp.to),
  });
  const filters = parsed.success ? parsed.data : {};
  const page = await listCalls(current.actor, query, filters);
  return <CallsPage page={page} filters={filters} />;
}
