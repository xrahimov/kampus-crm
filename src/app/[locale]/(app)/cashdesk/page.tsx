import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CashDeskPage } from "@/features/cashdesk/cashdesk-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listCashCloses, tashkentDate } from "@/server/services/finance/cash-close.service";

import { yearOptions } from "../finance/_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cashdesk");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

/** "/cashdesk": the cashier day closes (A-122). The period defaults to the current Tashkent month. */
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
  const actor = current.actor;
  if (!can(actor, "payments.create") && !can(actor, "finance.view")) return <Forbidden />;

  const sp = await searchParams;
  const today = tashkentDate();
  const yearParam = Number(str(sp.year));
  const year =
    Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam
      : Number(today.slice(0, 4));
  const monthParam = str(sp.month);
  const monthNumber = Number(monthParam);
  const month =
    monthParam === "all"
      ? null
      : Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
        ? monthNumber
        : Number(today.slice(5, 7));
  const branchParam = str(sp.branchId);
  // A branch outside the user's own is ignored rather than refused.
  const branchId =
    branchParam && current.branches.some((b) => b.id === branchParam) ? branchParam : null;
  const list = await listCashCloses(actor, {
    branchId: branchId ?? undefined,
    year,
    month: month ?? undefined,
  });

  return (
    <CashDeskPage
      list={list}
      filters={{ branchId, year, month }}
      branches={current.branches}
      activeBranchId={current.activeBranch?.id ?? null}
      years={yearOptions()}
      today={today}
      can={{
        close: can(actor, "payments.create"),
        accept: can(actor, "finance.update"),
        seeAll: can(actor, "finance.view"),
      }}
    />
  );
}
