import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { WaitlistPage } from "@/features/leads/waitlist-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { WAITLIST_SORT_FIELDS, waitlistFilterSchema } from "@/lib/validation/leads";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getLeadOptions } from "@/server/services/leads/leads.service";
import { listWaitlist } from "@/server/services/leads/waitlist.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.waitlist");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/leads/waitlist" (A-138): who waits for which course, in order. */
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
    sortable: WAITLIST_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "asc" },
  });
  const parsed = waitlistFilterSchema.safeParse({
    courseId: str(sp.courseId),
    status: str(sp.status),
  });
  const filters = parsed.success ? parsed.data : {};
  const [list, options] = await Promise.all([
    listWaitlist(current.actor, query, filters),
    getLeadOptions(current.actor),
  ]);
  const branches = current.branches.filter((b) => current.actor.branchIds.includes(b.id));
  const defaultBranchId =
    current.actor.activeBranchId ?? branches[0]?.id ?? current.actor.branchIds[0] ?? "";

  return (
    <WaitlistPage
      list={list}
      filters={filters}
      courses={options.courses}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      defaultBranchId={defaultBranchId}
      canCreate={can(current.actor, "leads.create")}
      canUpdate={can(current.actor, "leads.update")}
    />
  );
}
