import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { StaffCall } from "@/features/video/staff-call";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can } from "@/server/rbac/authorize";
import { getVideoRoom } from "@/server/services/video/video.service";

type Props = { params: Promise<{ locale: string; roomId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("video");
  return { title: t("title") };
}

/** `/video/:roomId`: a staff member's way into a group's call. */
export default async function Page({ params }: Props) {
  const { locale, roomId } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "groups.view")) return <Forbidden />;
  let room;
  try {
    room = await getVideoRoom(current.actor, roomId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  return <StaffCall room={room} name={current.user.fullName} />;
}
