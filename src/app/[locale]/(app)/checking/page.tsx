import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CheckingPage } from "@/features/homework/checking-page";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listCheckingQueue } from "@/server/services/homework/checking-queue.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("checking");
  return { title: t("title") };
}

/** The teacher's checking queue (A-160): homework answers waiting, oldest first. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "groups.attendance.mark")) return <Forbidden />;
  const queue = await listCheckingQueue(current.actor);
  return <CheckingPage initial={queue} />;
}
