import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MySalaryPage } from "@/features/account/my-salary-page";
import type { SearchParams } from "@/features/settings/list-params";
import { payrollMonthSchema } from "@/lib/validation/finance";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getMySalary } from "@/server/services/finance/my-salary.service";
import { tashkentToday } from "@/server/services/leads/shared";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("salary");
  return { title: t("title") };
}

/** "My salary" (A-127): the signed-in person's own pay for a month, `?month=YYYY-MM`. */
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
  const sp = await searchParams;
  const currentMonth = tashkentToday().slice(0, 7);
  const parsed = payrollMonthSchema.safeParse(typeof sp.month === "string" ? sp.month : "");
  const month = parsed.success ? parsed.data : currentMonth;
  const data = await getMySalary(current.actor, month);
  return <MySalaryPage data={data} currentMonth={currentMonth} />;
}
