import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { NotificationsPage } from "@/features/dashboard/notifications-page";
import type { SearchParams } from "@/features/settings/list-params";
import { notificationsQuerySchema } from "@/lib/validation/dashboard";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listNotifications } from "@/server/services/dashboard/notifications.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("title") };
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
  const sp = await searchParams;
  const parsed = notificationsQuerySchema.safeParse({ unread: str(sp.unread), page: str(sp.page) });
  const query = parsed.success ? parsed.data : { unread: false, page: 1 };
  const page = await listNotifications(current.actor, query);
  return <NotificationsPage page={page} unreadOnly={query.unread} />;
}
