import type { HelpArticleId, HelpAudience, HelpSectionIds } from "../catalog";

/**
 * One block of a manual section. A plain string is a paragraph; `steps` is a
 * numbered list of things to do in order; `note` is a short aside. Inside any
 * text, `**label**` marks a button or field exactly as the screen shows it.
 */
export type HelpBlock = string | { steps: string[] } | { note: string };

export interface HelpSectionText {
  title: string;
  body: HelpBlock[];
}

export interface HelpArticleText<A extends HelpArticleId> {
  title: string;
  summary: string;
  sections: Record<HelpSectionIds[A], HelpSectionText>;
}

export interface HelpAudienceText {
  title: string;
  /** Who this reader is, in one sentence. */
  summary: string;
  /** A short orientation paragraph shown above the article list. */
  startHere: string;
}

export interface HelpContent {
  audiences: Record<HelpAudience, HelpAudienceText>;
  articles: { [A in HelpArticleId]: HelpArticleText<A> };
}
