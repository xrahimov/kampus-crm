import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StudentPaymentsReport } from "@/features/reports/student-payments-report";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { STUDENT_PAYMENT_SORT_FIELDS, studentPaymentsFilterSchema } from "@/lib/validation/reports";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { monthPeriod } from "@/server/services/reports/shared";
import {
  getStudentPaymentsOptions,
  listStudentPayments,
} from "@/server/services/reports/student-payments.service";

import { pick } from "../_params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("studentPayments") };
}

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
  if (!can(current.actor, "reports.payments")) return <Forbidden />;
  const sp = await searchParams;
  const parsed = studentPaymentsFilterSchema.safeParse(
    pick(sp, [
      "branchId",
      "year",
      "month",
      "byPaidAt",
      "groupId",
      "paymentMethodId",
      "teacherId",
      "courseId",
      "bonus",
      "receivedById",
    ]),
  );
  const filters = parsed.success ? parsed.data : {};
  const query = listFromSearchParams(sp, {
    sortable: STUDENT_PAYMENT_SORT_FIELDS,
    defaultSort: { field: "paidAt", direction: "desc" },
  });
  const period = monthPeriod(filters.year, filters.month);
  const [page, options] = await Promise.all([
    listStudentPayments(current.actor, query, filters),
    getStudentPaymentsOptions(current.actor, filters.branchId),
  ]);
  return (
    <StudentPaymentsReport
      page={page}
      filters={{ ...filters, q: query.q }}
      options={options}
      branches={current.branches}
      year={period.year}
      month={period.month}
    />
  );
}
