import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { TrialPage } from "@/features/portal/trial-page";
import { getTrialPage } from "@/server/services/video/video.service";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const page = await getTrialPage(token);
  return page ? { title: `${page.groupName} · ${page.organizationName}`, robots: "noindex" } : {};
}

/** `/class/trial/:token`: a trial visitor's way into one online lesson (A-172). */
export default async function Page({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const page = await getTrialPage(token);
  if (!page) notFound();
  return (
    <div className="mx-auto w-full max-w-xl">
      <TrialPage token={token} initial={page} />
    </div>
  );
}
