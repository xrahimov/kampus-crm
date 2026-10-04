import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CoinsReportPage, type CoinsTab } from "@/features/reports/coins-report-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import {
  coinRatingFilterSchema,
  PURCHASE_STATUSES,
  type PurchaseStatus,
} from "@/lib/validation/coins";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getCoinReportOptions, getCoinsReport } from "@/server/services/coins/coins.service";
import {
  listProductCategories,
  listProducts,
  listPurchaseRequests,
} from "@/server/services/coins/marketplace.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports.items");
  return { title: t("coins") };
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
  if (!can(current.actor, "reports.view") && !can(current.actor, "coins.manage"))
    return <Forbidden />;

  const sp = await searchParams;
  const tabRaw = str(sp.tab);
  const tab: CoinsTab = tabRaw === "marketplace" || tabRaw === "requests" ? tabRaw : "rating";
  const parsed = coinRatingFilterSchema.safeParse({
    q: str(sp.q),
    branchId: str(sp.branchId),
    courseId: str(sp.courseId),
    groupId: str(sp.groupId),
    period: str(sp.period),
  });
  const filters = parsed.success ? parsed.data : coinRatingFilterSchema.parse({});
  const statusRaw = str(sp.status);
  const requestStatus = (PURCHASE_STATUSES as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as PurchaseStatus)
    : null;

  const [report, options, categories, products, requests] = await Promise.all([
    getCoinsReport(current.actor, filters),
    getCoinReportOptions(current.actor),
    listProductCategories(current.actor),
    listProducts(current.actor),
    listPurchaseRequests(current.actor, { status: requestStatus ?? undefined }),
  ]);

  return (
    <CoinsReportPage
      tab={tab}
      filters={filters}
      report={report}
      options={options}
      categories={categories}
      products={products}
      requests={requests}
      requestStatus={requestStatus ?? "ALL"}
      can={{ manage: can(current.actor, "coins.manage") }}
    />
  );
}
