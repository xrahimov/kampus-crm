import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PaymentsLog } from "@/features/payments/payments-log";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { PAYMENT_SORT_FIELDS, paymentFilterSchema } from "@/lib/validation/students";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getPaymentOptions, listPayments } from "@/server/services/students/payments.service";
import { listStaff } from "@/server/services/staff/staff.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("payments") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

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
  const query = listFromSearchParams(sp, {
    sortable: PAYMENT_SORT_FIELDS,
    defaultSort: { field: "paidAt", direction: "desc" },
  });
  const parsed = paymentFilterSchema.safeParse({
    from: str(sp.from),
    to: str(sp.to),
    paymentMethodId: str(sp.paymentMethodId),
    receivedById: str(sp.receivedById),
  });
  const filters = parsed.success ? parsed.data : {};
  const [page, options, cashiers] = await Promise.all([
    listPayments(current.actor, query, filters),
    getPaymentOptions(current.actor),
    can(current.actor, "staff.view")
      ? listStaff(
          current.actor,
          "staff",
          {
            page: 1,
            pageSize: 100,
            skip: 0,
            take: 100,
            sort: { field: "fullName", direction: "asc" },
          },
          {},
        ).then((p) => p.items.map((s) => ({ id: s.id, fullName: s.fullName })))
      : Promise.resolve([]),
  ]);

  return (
    <PaymentsLog page={page} filters={filters} methods={options.methods} cashiers={cashiers} />
  );
}
