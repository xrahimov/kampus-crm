import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PayrollPage } from "@/features/finance/payroll-page";
import { Forbidden } from "@/features/settings/forbidden";
import { payrollMonthSchema } from "@/lib/validation/finance";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getPayroll } from "@/server/services/finance/payroll.service";

type Props = { params: Promise<{ locale: string; month: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("finance.payroll");
  return { title: t("title") };
}

/** "/finance/salary-detail/:YYYY-MM-01" (EXP §9). */
export default async function Page({ params }: Props) {
  const { locale, month } = await params;
  setRequestLocale(locale);
  const parsed = payrollMonthSchema.safeParse(month);
  if (!parsed.success) notFound();
  const current = await requireCurrentUser();
  if (!can(current.actor, "finance.view")) return <Forbidden />;
  const run = await getPayroll(current.actor, parsed.data);
  return (
    <PayrollPage
      run={run}
      can={{
        update: can(current.actor, "finance.update"),
        approve: can(current.actor, "finance.payroll.approve"),
      }}
    />
  );
}
