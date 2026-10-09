import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { TimetablePage } from "@/features/timetable/timetable-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getTimetable } from "@/server/services/groups/clashes.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("timetable");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** A week of one room or one teacher (A-116). */
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
  const mode = sp.mode === "teacher" ? "teacher" : sp.mode === "room" ? "room" : undefined;
  const data = await getTimetable(current.actor, {
    mode,
    branchId: str(sp.branchId),
    id: str(sp.id),
  });
  return <TimetablePage data={data} />;
}
