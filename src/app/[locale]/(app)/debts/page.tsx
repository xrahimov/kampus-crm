import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DebtsPage } from "@/features/debts/debts-page";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { DEBT_SORT_FIELDS, debtFilterSchema } from "@/lib/validation/debts";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listDebtCases } from "@/server/services/debts/debts.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("debts");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/debts": the debtor list with promises, contacts and reminders (A-112). */
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
  if (!can(current.actor, "payments.create")) return <Forbidden />;

  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: DEBT_SORT_FIELDS,
    defaultSort: { field: "openedAt", direction: "asc" },
  });
  const branchId = str(sp.branchId);
  const parsed = debtFilterSchema.safeParse({
    // A branch outside the user's own is ignored rather than refused.
    branchId: branchId && current.branches.some((b) => b.id === branchId) ? branchId : undefined,
    status: str(sp.status),
  });
  const filters = parsed.success ? parsed.data : {};
  const list = await listDebtCases(current.actor, query, filters);

  return (
    <DebtsPage
      list={list}
      filters={filters}
      branches={current.activeBranch ? [] : current.branches}
    />
  );
}
