import type { AppLocale } from "@/i18n/routing";

import { en } from "./en";
import { ru } from "./ru";
import type { HelpContent } from "./types";
import { uz } from "./uz";

const CONTENT: Record<AppLocale, HelpContent> = { uz, ru, en };

/** The manual in the given language; falls back to Uzbek, the default locale. */
export function getHelpContent(locale: string): HelpContent {
  return CONTENT[locale as AppLocale] ?? uz;
}

export type { HelpArticleText, HelpBlock, HelpContent, HelpSectionText } from "./types";
