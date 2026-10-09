import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { ScanPage } from "@/features/today/scan-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getToday } from "@/server/services/today/today.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today.scan");
  return { title: t("title") };
}

/** "/today/scan?lesson=…" (A-139): badges mark students present. */
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
  if (!can(current.actor, "groups.attendance.mark")) return <Forbidden />;
  const sp = await searchParams;
  const lessonId = typeof sp.lesson === "string" ? sp.lesson : null;
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  let lesson = null;
  if (lessonId) {
    const today = await getToday(current.actor, date);
    const found = today.lessons.find((l) => l.id === lessonId);
    if (found) {
      lesson = {
        id: found.id,
        groupName: found.groupName,
        startTime: found.startTime,
        endTime: found.endTime,
      };
    }
  }
  return <ScanPage lesson={lesson} />;
}
