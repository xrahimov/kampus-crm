import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AbsencesPage } from "@/features/absences/absences-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { ABSENCE_SORT_FIELDS, absenceFilterSchema } from "@/lib/validation/absences";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listAbsenceCases } from "@/server/services/absences/absences.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("absences");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/absences": students who stopped coming, with calls and outcomes (A-125). */
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
  if (!can(current.actor, "students.update")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: ABSENCE_SORT_FIELDS,
    defaultSort: { field: "sinceAt", direction: "asc" },
  });
  const branchId = str(sp.branchId);
  const parsed = absenceFilterSchema.safeParse({
    // A branch outside the user's own is ignored rather than refused.
    branchId: branchId && current.branches.some((b) => b.id === branchId) ? branchId : undefined,
    status: str(sp.status),
    reason: str(sp.reason),
  });
  const filters = parsed.success ? parsed.data : {};
  const list = await listAbsenceCases(current.actor, query, filters);

  return (
    <AbsencesPage
      list={list}
      filters={filters}
      branches={current.activeBranch ? [] : current.branches}
    />
  );
}
