import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { TodayPage } from "@/features/today/today-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getTeachingDesk } from "@/server/services/today/teaching-desk.service";
import { getToday } from "@/server/services/today/today.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("today");
  return { title: t("title") };
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
  if (!can(current.actor, "groups.view")) return <Forbidden />;
  const sp = await searchParams;
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;
  const data = await getToday(current.actor, date);
  // In the teaching view, today opens with the teacher's desk on top (A-194).
  const { view } = current;
  const desk =
    view.current === "TEACHING" && data.date === data.today
      ? await getTeachingDesk(current.actor)
      : null;
  let fullViewName: string | null = null;
  if (view.canSwitch) {
    const t = await getTranslations();
    const other = view.otherRoles.length === 1 ? view.otherRoles[0]! : null;
    fullViewName = !other
      ? t("view.full")
      : t.has(`roles.${other.code}`)
        ? t(`roles.${other.code}`)
        : other.name;
  }
  return (
    <TodayPage
      data={data}
      userName={current.user.fullName}
      desk={desk}
      fullViewName={fullViewName}
    />
  );
}
