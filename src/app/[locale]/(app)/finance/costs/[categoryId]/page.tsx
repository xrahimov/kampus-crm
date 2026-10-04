import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { EntriesPage } from "@/features/finance/entries-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can } from "@/server/rbac/authorize";
import { getCategory } from "@/server/services/finance/categories.service";
import { getFinanceOptions, listEntries } from "@/server/services/finance/entries.service";

import { financeParams, yearOptions } from "../../_params";

type Props = {
  params: Promise<{ locale: string; categoryId: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoryId } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "finance.view")) return {};
  try {
    return { title: (await getCategory(current.actor, categoryId)).name };
  } catch {
    return {};
  }
}

/** "/finance/costs/:categoryId": expense and income categories share the route (EXP §9). */
export default async function Page({ params, searchParams }: Props) {
  const { locale, categoryId } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "finance.view")) return <Forbidden />;
  let category;
  try {
    category = await getCategory(current.actor, categoryId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const f = financeParams(await searchParams);
  const [list, options] = await Promise.all([
    listEntries(current.actor, {
      type: category.kind,
      categoryId,
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
      type={category.kind}
      category={category}
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
