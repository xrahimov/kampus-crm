import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { readableHelpArticles, type HelpSectionSpec } from "@/features/help/catalog";
import { getHelpContent } from "@/features/help/content";
import { HelpVideo } from "@/features/help/help-video";
import { helpVideoSrc, helpVideoText } from "@/features/help/videos";
import { Link } from "@/i18n/navigation";
import { requireCurrentUser } from "@/server/auth/current-user";
import { availableHelpVideos } from "@/server/help-videos";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("videos") };
}

/** Every how-to video the reader's language has on this server, in the manual's order (A-199). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("help");
  const siteOwner = (await requireCurrentUser()).actor.isSiteOwner === true;
  const content = getHelpContent(locale);
  const available = await availableHelpVideos(locale);
  const videos = readableHelpArticles(siteOwner).flatMap((article) =>
    (article.sections as readonly HelpSectionSpec[]).flatMap((section) =>
      section.video && available.has(section.video)
        ? [
            {
              id: section.video,
              href: `/help/${article.slug}#${section.id}`,
              article: content.articles[article.id].title,
            },
          ]
        : [],
    ),
  );

  return (
    <div className="space-y-6" data-testid="help-videos">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/help">
          <ArrowLeft /> {t("allManuals")}
        </Link>
      </Button>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t("videos")}</h1>
        <p className="mt-1 text-muted-foreground">{t("videosIntro")}</p>
      </header>
      {videos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noVideos")}</p>
      ) : (
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {videos.map((video) => {
            const text = helpVideoText(locale, video.id);
            return (
              <div key={video.id} data-testid="help-videos-item">
                <HelpVideo
                  src={helpVideoSrc(locale, video.id)}
                  title={text.title}
                  note={text.note}
                  label={t("video")}
                  className="mb-2"
                />
                <Link
                  href={video.href}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("readSteps", { article: video.article })}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
