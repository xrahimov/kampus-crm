import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useLocaleChoice } from "@/lib/i18n";

/*
 * The manual for the app (A-252): the site's Help pages as data. One call,
 * `GET /help?locale=`, answers every article the reader may open, whole, in
 * one language: the same articles in the same order with the same words,
 * pictures and videos as the site shows. The search is the site's own, run on
 * the server (`GET /help/search`), so both find the same sections.
 */

/** Who an article is written for; the Help home's "Who are you?" (`HELP_AUDIENCES` on the site). */
export type HelpAudience = "CEO" | "BRANCH_MANAGER" | "ADMIN" | "CASHIER" | "TEACHER" | "STUDENT";

/** A paragraph, numbered steps, or a note set apart. `**label**` in any of them is a button's name. */
export type HelpBlock = string | { steps: string[] } | { note: string };

export interface ManualVideo {
  id: string;
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
  /** The section's how-to video, when the server has it in this language. */
  video: ManualVideo | null;
  /** The first picture stands above the text, the rest after it. */
  screenshot: ManualPicture | null;
  more: ManualPicture[];
}

export interface ManualArticle {
  id: string;
  slug: string;
  audiences: HelpAudience[];
  /** The site's path of the page the article is about; null when it has none. */
  path: string | null;
  title: string;
  summary: string;
  sections: ManualSection[];
}

export interface Manual {
  locale: string;
  /** The manual this reader opens first, by their roles. */
  audience: HelpAudience;
  audiences: Array<{ id: HelpAudience; title: string; summary: string; startHere: string }>;
  articles: ManualArticle[];
}

/** One section the search found. */
export interface HelpHit {
  articleId: string;
  slug: string;
  articleTitle: string;
  sectionId: string;
  sectionTitle: string;
  /** The sentence around the first match. */
  snippet: string;
  score: number;
}

/** The search answers from this many letters, as on the site. */
export const HELP_SEARCH_MIN = 2;

/**
 * The whole manual in the app's language. It changes only with a server
 * update, so it is asked for once and kept for the day; the Help home, an
 * article and the videos page all read from the same answer.
 */
export function useManual() {
  const { locale } = useLocaleChoice();
  return useQuery({
    queryKey: ["help", "manual", locale],
    queryFn: ({ signal }) => api<Manual>(`/help?locale=${locale}`, { signal }),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/** The sections that carry these words; nothing is asked for under two letters. */
export function useManualSearch(query: string) {
  const { locale } = useLocaleChoice();
  const q = query.trim();
  return useQuery({
    queryKey: ["help", "search", locale, q],
    queryFn: ({ signal }) =>
      api<HelpHit[]>(`/help/search?locale=${locale}&q=${encodeURIComponent(q)}`, { signal }),
    enabled: q.length >= HELP_SEARCH_MIN,
    staleTime: 5 * 60 * 1000,
    // The last answer stays while the next letters are looked up: the list does not blink.
    placeholderData: keepPreviousData,
  });
}

/** Every video of the manual with the section it belongs to, in the manual's order. */
export function manualVideos(
  manual: Manual,
): Array<{ video: ManualVideo; article: ManualArticle; sectionId: string }> {
  return manual.articles.flatMap((article) =>
    article.sections.flatMap((section) =>
      section.video ? [{ video: section.video, article, sectionId: section.id }] : [],
    ),
  );
}

/** The app's page of an article, opened at a section when one is named. */
export function articleRoute(slug: string, section?: string) {
  return {
    pathname: "/staff/help/[slug]" as const,
    params: section ? { slug, section } : { slug },
  };
}
