import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { EntriesPage } from "@/features/finance/entries-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import type { FinanceEntryType } from "@/lib/validation/finance";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getFinanceOptions, listEntries } from "@/server/services/finance/entries.service";

import { financeParams, yearOptions } from "../_params";

/** The reference's sub-page slugs (EXP §9). */
const SECTIONS: Record<string, FinanceEntryType> = {
  advance: "ADVANCE",
  marketing: "MARKETING",
  bonus: "BONUS",
  penalty: "PENALTY",
  investment: "INVESTMENT",
};

type Props = {
  params: Promise<{ locale: string; section: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  if (!SECTIONS[section]) return {};
  const t = await getTranslations("finance.sections");
  return { title: t(section) };
}

export default async function Page({ params, searchParams }: Props) {
  const { locale, section } = await params;
  setRequestLocale(locale);
  const type = SECTIONS[section];
  if (!type) notFound();
  const current = await requireCurrentUser();
  if (!can(current.actor, "finance.view")) return <Forbidden />;
  const f = financeParams(await searchParams);
  const [list, options] = await Promise.all([
    listEntries(current.actor, {
      type,
      branchId: f.branchId ?? undefined,
      year: f.year,
      month: f.month ?? undefined,
      paymentMethodId: f.paymentMethodId ?? undefined,
      staffId: f.staffId ?? undefined,
    }),
    getFinanceOptions(current.actor),
  ]);
  return (
    <EntriesPage
      type={type}
      category={null}
      list={list}
      filters={f}
      options={options}
      years={yearOptions()}
      defaultBranchId={current.actor.activeBranchId ?? options.branches[0]?.id ?? ""}
      can={{
        create: can(current.actor, "finance.create"),
        update: can(current.actor, "finance.update"),
        delete: can(current.actor, "finance.delete"),
      }}
    />
  );
}
