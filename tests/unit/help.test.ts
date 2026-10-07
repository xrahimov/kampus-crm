import { describe, expect, it } from "vitest";

import { HELP_ARTICLES, HELP_AUDIENCES } from "@/features/help/catalog";
import { en } from "@/features/help/content/en";
import { ru } from "@/features/help/content/ru";
import type { HelpSectionText } from "@/features/help/content/types";
import { uz } from "@/features/help/content/uz";
import { searchHelp, tokenize } from "@/features/help/search";

const LANGS = { en, ru, uz };

describe("help catalogue", () => {
  it("has text in every language for every article, section and audience", () => {
    for (const [lang, content] of Object.entries(LANGS)) {
      for (const spec of HELP_ARTICLES) {
        const article = content.articles[spec.id];
        expect(article.title, `${lang} ${spec.id} title`).toBeTruthy();
        for (const section of spec.sections) {
          const text = (article.sections as Record<string, HelpSectionText>)[section.id];
          expect(text?.title, `${lang} ${spec.id}.${section.id}`).toBeTruthy();
          if (!text) continue;
          expect(text.body.length, `${lang} ${spec.id}.${section.id} body`).toBeGreaterThan(0);
        }
      }
      for (const audience of HELP_AUDIENCES) {
        expect(content.audiences[audience].startHere, `${lang} ${audience}`).toBeTruthy();
      }
    }
  });

  it("keeps the same shape across languages", () => {
    for (const spec of HELP_ARTICLES) {
      for (const section of spec.sections) {
        const shapes = Object.values(LANGS).map((c) =>
          (c.articles[spec.id].sections as Record<string, HelpSectionText>)[section.id]!.body.map(
            (b) =>
              typeof b === "string" ? "p" : "steps" in b ? `steps:${b.steps.length}` : "note",
          ),
        );
        expect(shapes[1], `ru ${spec.id}.${section.id}`).toEqual(shapes[0]);
        expect(shapes[2], `uz ${spec.id}.${section.id}`).toEqual(shapes[0]);
      }
    }
  });

  it("has a slug and at least one audience per article", () => {
    const slugs = new Set(HELP_ARTICLES.map((a) => a.slug));
    expect(slugs.size).toBe(HELP_ARTICLES.length);
    for (const a of HELP_ARTICLES) expect(a.audiences.length).toBeGreaterThan(0);
  });
});

describe("help search", () => {
  it("tokenizes and ignores apostrophes", () => {
    expect(tokenize("O‘quvchi qo'shish")).toEqual(["oquvchi", "qoshish"]);
    expect(tokenize("a")).toEqual([]);
  });

  it("leads to the section that explains refunds", () => {
    const hits = searchHelp(en, "refund");
    expect(hits[0]).toMatchObject({ slug: "payments", sectionId: "refund" });
    expect(hits[0]!.snippet).toContain("Refund");
  });

  it("finds the same thing in Russian and Uzbek", () => {
    expect(searchHelp(ru, "возврат")[0]).toMatchObject({ slug: "payments" });
    expect(searchHelp(uz, "dam olish kuni")[0]).toMatchObject({ slug: "groups" });
  });

  it("requires every word to match and returns nothing for gibberish", () => {
    expect(searchHelp(en, "homework telegram")[0]!.slug).toBe("teaching");
    expect(searchHelp(en, "xyzzy")).toEqual([]);
    expect(searchHelp(en, "")).toEqual([]);
  });
});
