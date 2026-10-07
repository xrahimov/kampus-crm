import { HELP_ARTICLES, type HelpArticleId, type HelpArticleSpec } from "./catalog";
import type { HelpBlock, HelpContent, HelpSectionText } from "./content";

export interface HelpHit {
  articleId: HelpArticleId;
  slug: string;
  articleTitle: string;
  sectionId: string;
  sectionTitle: string;
  /** The sentence around the first match, for the result list. */
  snippet: string;
  score: number;
}

const MIN_TOKEN = 2;
const MAX_HITS = 12;

/** Lower-case, apostrophes removed so "o‘quvchi", "o'quvchi" and "oquvchi" match. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’'`ʻʼ]/g, "")
    .replace(/\*\*/g, "");
}

export function tokenize(query: string): string[] {
  return Array.from(
    new Set(
      normalize(query)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= MIN_TOKEN),
    ),
  );
}

function blockText(block: HelpBlock): string {
  if (typeof block === "string") return block;
  if ("steps" in block) return block.steps.join(" ");
  return block.note;
}

function sentenceAround(text: string, token: string): string {
  const plain = text.replace(/\*\*/g, "");
  const at = normalize(plain).indexOf(token);
  if (at < 0) return plain.slice(0, 160);
  const start = Math.max(plain.lastIndexOf(". ", at) + 1, 0);
  const end = plain.indexOf(". ", at);
  return plain.slice(start, end < 0 ? undefined : end + 1).trim();
}

/**
 * Full-text search over the manual in one language. Every token must occur
 * somewhere in the article (title, summary or section); sections that carry
 * the tokens themselves rank first, and title matches count more than body
 * matches. Pure, so it runs the same on the server and in the browser.
 */
export function searchHelp(
  content: HelpContent,
  query: string,
  articles: readonly HelpArticleSpec[] = HELP_ARTICLES,
): HelpHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const hits: HelpHit[] = [];

  for (const spec of articles) {
    const article = content.articles[spec.id];
    const articleTitle = normalize(article.title);
    const articleText = normalize(`${article.title} ${article.summary}`);
    const texts = article.sections as Record<string, HelpSectionText>;
    const sections = spec.sections.map((s) => {
      const text = texts[s.id]!;
      const body = text.body.map(blockText).join(" ");
      return { id: s.id, title: text.title, body, norm: normalize(`${text.title} ${body}`) };
    });
    const everywhere = `${articleText} ${sections.map((s) => s.norm).join(" ")}`;
    if (!tokens.every((t) => everywhere.includes(t))) continue;

    for (const section of sections) {
      let score = 0;
      let first: string | null = null;
      for (const token of tokens) {
        if (normalize(section.title).includes(token)) score += 4;
        if (articleTitle.includes(token)) score += 2;
        if (section.norm.includes(token)) {
          score += 1;
          first ??= token;
        }
      }
      if (first === null) continue;
      hits.push({
        articleId: spec.id,
        slug: spec.slug,
        articleTitle: article.title,
        sectionId: section.id,
        sectionTitle: section.title,
        snippet: sentenceAround(section.body, first),
        score,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_HITS);
}
