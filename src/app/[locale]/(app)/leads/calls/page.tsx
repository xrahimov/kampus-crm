import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CallsPage } from "@/features/leads/calls-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { LEAD_CALL_SORT_FIELDS, leadCallsFilterSchema } from "@/lib/validation/leads";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { can } from "@/server/rbac/authorize";
import { listLeadCalls } from "@/server/services/leads/follow-up.service";
import { leadHandlers } from "@/server/services/leads/leads.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.calls");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/leads/calls" (A-126): the leads whose next contact is due, by owner. */
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
  const query = listFromSearchParams(sp, {
    sortable: LEAD_CALL_SORT_FIELDS,
    defaultSort: { field: "nextContactAt", direction: "asc" },
  });
  const parsed = leadCallsFilterSchema.safeParse({
    ownerId: str(sp.ownerId),
    range: str(sp.range),
  });
  const filters = parsed.success ? parsed.data : {};
  const [list, owners] = await Promise.all([
    listLeadCalls(current.actor, query, filters),
    leadHandlers(prisma, current.actor),
  ]);

  return (
    <CallsPage
      list={list}
      filters={filters}
      owners={owners}
      userId={current.actor.userId}
      canUpdate={can(current.actor, "leads.update")}
    />
  );
}
