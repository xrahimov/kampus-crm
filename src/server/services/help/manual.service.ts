import { audienceForRoles } from "@/features/help/audience";
import {
  HELP_AUDIENCES,
  readableHelpArticles,
  type HelpArticleId,
  type HelpArticleSpec,
  type HelpAudience,
  type HelpSectionSpec,
} from "@/features/help/catalog";
import { getHelpContent, type HelpBlock, type HelpSectionText } from "@/features/help/content";
import { searchHelp, type HelpHit } from "@/features/help/search";
import { helpVideoSrc, helpVideoText, type HelpVideoId } from "@/features/help/videos";
import { locales, type AppLocale } from "@/i18n/routing";
import type { Actor } from "@/server/rbac/authorize";
import { helpPictureSize } from "@/server/help-pictures";
import { availableHelpVideos } from "@/server/help-videos";

/*
 * The manual for the phone app (A-252). The site renders the manual on its own
 * pages from `src/features/help`; the app is a project of its own and cannot
 * read those files, so the same manual is answered here as data: the same
 * articles, in the same order, with the same words, pictures and videos.
 */

export interface ManualVideo {
  id: HelpVideoId;
  title: string;
  /** One line on what the video covers. */
  note: string;
  /** Where its file is asked for, from the server's root. */
  src: string;
}

export interface ManualPicture {
  /** Where its file is asked for, from the server's root. */
  src: string;
  /** Its own size: most are a page of the site, some a single card or a phone's screen. */
  width: number;
  height: number;
}

export interface ManualSection {
  id: string;
  title: string;
  body: HelpBlock[];
  /** The section's how-to video, when this server has it in this language. */
  video: ManualVideo | null;
  /** The first picture stands above the text, the rest after it. */
  screenshot: ManualPicture | null;
  more: ManualPicture[];
}

export interface ManualArticle {
  id: HelpArticleId;
  slug: string;
  audiences: HelpAudience[];
  /** The page the article is about, for "Open the page"; null when it has none. */
  path: string | null;
  title: string;
  summary: string;
  sections: ManualSection[];
}

export interface Manual {
  locale: AppLocale;
  /** The manual this reader opens first, by their roles. */
  audience: HelpAudience;
  audiences: Array<{ id: HelpAudience; title: string; summary: string; startHere: string }>;
  articles: ManualArticle[];
}

/** The language asked for, or Uzbek, the site's default. */
export function manualLocale(value: string | null | undefined): AppLocale {
  return (locales as readonly string[]).includes(value ?? "") ? (value as AppLocale) : "uz";
}

async function picture(locale: AppLocale, name: string): Promise<ManualPicture> {
  return { src: `/help/${locale}/${name}.jpg`, ...(await helpPictureSize(locale, name)) };
}

/** Every article this person may read, whole, in one language. */
export async function getManual(actor: Actor, locale: AppLocale): Promise<Manual> {
  const content = getHelpContent(locale);
  const videos = await availableHelpVideos(locale);
  const articles = await Promise.all(
    readableHelpArticles(actor.isSiteOwner === true).map(
      async (spec: HelpArticleSpec): Promise<ManualArticle> => {
        const text = content.articles[spec.id];
        const texts = text.sections as Record<string, HelpSectionText>;
        return {
          id: spec.id,
          slug: spec.slug,
          audiences: [...spec.audiences],
          path: spec.path,
          title: text.title,
          summary: text.summary,
          sections: await Promise.all(
            (spec.sections as readonly HelpSectionSpec[]).map(async (section) => {
              const words = texts[section.id]!;
              const video =
                section.video && videos.has(section.video)
                  ? {
                      id: section.video,
                      ...helpVideoText(locale, section.video),
                      src: helpVideoSrc(locale, section.video),
                    }
                  : null;
              return {
                id: section.id,
                title: words.title,
                body: words.body,
                video,
                screenshot: section.screenshot ? await picture(locale, section.screenshot) : null,
                more: await Promise.all((section.more ?? []).map((name) => picture(locale, name))),
              };
            }),
          ),
        };
      },
    ),
  );
  return {
    locale,
    audience: audienceForRoles(actor.roles),
    audiences: HELP_AUDIENCES.map((id) => ({ id, ...content.audiences[id] })),
    articles,
  };
}

/** The site's search over the manual, for the same reader and language. */
export function searchManual(actor: Actor, locale: AppLocale, query: string): HelpHit[] {
  return searchHelp(
    getHelpContent(locale),
    query,
    readableHelpArticles(actor.isSiteOwner === true),
  );
}
