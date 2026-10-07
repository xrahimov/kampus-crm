import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { HELP_ARTICLE_BY_SLUG, readableHelpArticles } from "@/features/help/catalog";
import { getHelpContent } from "@/features/help/content";
import { HelpArticle } from "@/features/help/help-article";
import { requireCurrentUser } from "@/server/auth/current-user";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const spec = HELP_ARTICLE_BY_SLUG.get(slug);
  if (!spec) return {};
  return { title: getHelpContent(locale).articles[spec.id].title };
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const spec = HELP_ARTICLE_BY_SLUG.get(slug);
  if (!spec) notFound();
  const siteOwner = (await requireCurrentUser()).actor.isSiteOwner === true;
  if (spec.siteOwner && !siteOwner) notFound();
  const content = getHelpContent(locale);
  const articles = readableHelpArticles(siteOwner);
  const index = articles.findIndex((a) => a.id === spec.id);
  const neighbour = (i: number) => {
    const a = articles[i];
    return a ? { href: `/help/${a.slug}`, title: content.articles[a.id].title } : undefined;
  };
  return (
    <HelpArticle
      locale={locale}
      spec={spec}
      content={content}
      homeHref="/help"
      previous={neighbour(index - 1)}
      next={neighbour(index + 1)}
    />
  );
}
