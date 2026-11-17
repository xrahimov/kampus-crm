import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { WORDS, type Locale } from "../../scripts/tutorial-videos/words";

type Messages = { [key: string]: string | Messages };

function label(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return typeof node === "string" ? node : undefined;
}

describe("how-to videos", () => {
  it("names only buttons and pages that exist, in every language", () => {
    for (const locale of Object.keys(WORDS) as Locale[]) {
      const messages = JSON.parse(
        readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as Messages;
      for (const [id, video] of Object.entries(WORDS[locale].videos)) {
        for (const [step, caption] of Object.entries(video.steps as Record<string, string>)) {
          for (const [, key] of caption.matchAll(/\{([\w.]+)\}/g)) {
            expect(label(messages, key!), `${locale} ${id}.${step}: {${key}}`).toBeTruthy();
          }
        }
      }
    }
  });

  it("has a title, a note and a caption for every step, in every language", () => {
    for (const locale of Object.keys(WORDS) as Locale[]) {
      expect(WORDS[locale].series, `${locale} series`).toBeTruthy();
      for (const [id, video] of Object.entries(WORDS.en.videos)) {
        const mine = WORDS[locale].videos[id as keyof typeof WORDS.en.videos];
        expect(mine.title, `${locale} ${id} title`).toBeTruthy();
        expect(mine.note, `${locale} ${id} note`).toBeTruthy();
        for (const step of Object.keys(video.steps)) {
          expect(
            (mine.steps as Record<string, string>)[step],
            `${locale} ${id}.${step}`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("keeps a caption short enough to read on two lines", () => {
    for (const locale of Object.keys(WORDS) as Locale[]) {
      for (const [id, video] of Object.entries(WORDS[locale].videos)) {
        for (const [step, caption] of Object.entries(video.steps as Record<string, string>)) {
          expect(caption.length, `${locale} ${id}.${step}`).toBeLessThanOrEqual(200);
        }
      }
    }
  });
});
