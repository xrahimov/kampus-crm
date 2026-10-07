import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { HELP_ARTICLE_BY_SLUG } from "@/features/help/catalog";
import { getHelpContent } from "@/features/help/content";
import { HelpArticle } from "@/features/help/help-article";
import { getClassPage } from "@/server/services/video/video.service";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("help");
  return {
    title: `${t("title")} · ${getHelpContent(locale).articles.studentPortal.title}`,
    robots: "noindex",
  };
}

/** The student's manual, reachable from their personal page without signing in. */
export default async function Page({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  if (!(await getClassPage(token))) notFound();
  const spec = HELP_ARTICLE_BY_SLUG.get("student");
  if (!spec?.isPublic) notFound();
  return (
    <div className="mx-auto w-full max-w-4xl">
      <HelpArticle
        locale={locale}
        spec={spec}
        content={getHelpContent(locale)}
        homeHref={`/class/${token}`}
      />
    </div>
  );
}
