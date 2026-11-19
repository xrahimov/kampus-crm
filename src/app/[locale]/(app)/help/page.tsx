import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { audienceForRoles } from "@/features/help/audience";
import { readableHelpArticles, type HelpSectionSpec } from "@/features/help/catalog";
import { getHelpContent } from "@/features/help/content";
import { HelpHome } from "@/features/help/help-home";
import { requireCurrentUser } from "@/server/auth/current-user";
import { availableHelpVideos } from "@/server/help-videos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const content = getHelpContent(locale);
  const siteOwner = current.actor.isSiteOwner === true;
  const available = await availableHelpVideos(locale);
  const videoCount = readableHelpArticles(siteOwner)
    .flatMap((article) => article.sections as readonly HelpSectionSpec[])
    .filter((section) => section.video && available.has(section.video)).length;
  return (
    <HelpHome
      content={content}
      defaultAudience={audienceForRoles(current.actor.roles)}
      siteOwner={siteOwner}
      videoCount={videoCount}
    />
  );
}
