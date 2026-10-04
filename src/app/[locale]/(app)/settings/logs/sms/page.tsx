import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { SmsLogPage } from "@/features/settings/logs/sms-log-page";
import { smsLogFilterSchema } from "@/lib/validation/integrations";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listActionLogActors } from "@/server/services/logs/logs.service";
import { SMS_LOG_SORT_FIELDS, listSmsLog } from "@/server/services/sms/sms.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("smsLog") };
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
  if (!can(current.actor, "logs.view")) return <Forbidden />;
  const sp = await searchParams;
  const query = listFromSearchParams(sp, {
    sortable: SMS_LOG_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const parsed = smsLogFilterSchema.safeParse({
    from: str(sp.from),
    to: str(sp.to),
    status: str(sp.status),
    sentBy: str(sp.sentBy),
  });
  const filters = parsed.success ? parsed.data : {};
  const [page, senders] = await Promise.all([
    listSmsLog(current.actor, query, filters),
    listActionLogActors(current.actor),
  ]);
  return <SmsLogPage page={page} filters={filters} senders={senders} />;
}
