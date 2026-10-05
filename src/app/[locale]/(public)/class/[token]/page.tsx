import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ClassPage } from "@/features/video/class-page";
import { getClassPage } from "@/server/services/video/video.service";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const page = await getClassPage(token);
  return page ? { title: `${page.groupName} · ${page.organizationName}`, robots: "noindex" } : {};
}

/** `/class/:token`: a student's personal link to their group's video lessons. */
export default async function Page({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const page = await getClassPage(token);
  if (!page) notFound();
  return <ClassPage token={token} initial={page} />;
}
