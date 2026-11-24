import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HELP_ARTICLES } from "@/features/help/catalog";
import { getHelpContent } from "@/features/help/content";
import { helpVideoFile } from "@/features/help/videos";
import { locales } from "@/i18n/routing";
import { helpPictureSize, jpegSize, PAGE_PICTURE } from "@/server/help-pictures";
import { forgetHelpVideos } from "@/server/help-videos";
import type { Actor } from "@/server/rbac/authorize";
import { getManual, manualLocale, searchManual } from "@/server/services/help/manual.service";

/*
 * The manual as data, for the phone app (A-252): the same articles, words,
 * pictures and videos as the site's Help pages, for the same reader.
 */

function actor(change: Partial<Actor> = {}): Actor {
  return {
    userId: "u1",
    fullName: "Test Person",
    organizationId: "o1",
    roles: ["ADMIN"],
    permissions: [],
    branchIds: [],
    activeBranchId: null,
    ...change,
  };
}

describe("the manual for the app", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "help-manual-"));
  const before = process.env.HELP_VIDEOS_DIR;

  beforeAll(() => {
    process.env.HELP_VIDEOS_DIR = dir;
    mkdirSync(path.join(dir, "en"), { recursive: true });
    writeFileSync(path.join(dir, "en", helpVideoFile("sign-in")), "not a real film");
    forgetHelpVideos();
  });
  afterAll(() => {
    if (before === undefined) delete process.env.HELP_VIDEOS_DIR;
    else process.env.HELP_VIDEOS_DIR = before;
    rmSync(dir, { recursive: true, force: true });
    forgetHelpVideos();
  });

  it("has the site's articles in the site's order, with the site's words", async () => {
    const manual = await getManual(actor({ isSiteOwner: true }), "en");
    expect(manual.articles.map((a) => a.id)).toEqual(HELP_ARTICLES.map((a) => a.id));
    const content = getHelpContent("en");
    for (const article of manual.articles) {
      const spec = HELP_ARTICLES.find((a) => a.id === article.id)!;
      expect(article.slug).toBe(spec.slug);
      expect(article.path).toBe(spec.path);
      expect(article.title).toBe(content.articles[article.id].title);
      expect(article.sections.map((s) => s.id)).toEqual(spec.sections.map((s) => s.id));
      for (const section of article.sections) {
        expect(section.title).not.toBe("");
        expect(section.body.length).toBeGreaterThan(0);
      }
    }
    expect(manual.audiences.map((a) => a.id)).toContain("TEACHER");
    expect(manual.audiences[0]!.startHere).toBe(content.audiences.CEO.startHere);
  });

  it("keeps the site owner's article from everyone else", async () => {
    const owner = await getManual(actor({ isSiteOwner: true }), "en");
    const other = await getManual(actor(), "en");
    expect(owner.articles.some((a) => a.id === "organizations")).toBe(true);
    expect(other.articles.some((a) => a.id === "organizations")).toBe(false);
    expect(other.articles).toHaveLength(owner.articles.length - 1);
    // The search follows the same rule.
    const word = getHelpContent("en").articles.organizations.title.split(" ")[0]!;
    expect(
      searchManual(actor({ isSiteOwner: true }), "en", word).some(
        (hit) => hit.articleId === "organizations",
      ),
    ).toBe(true);
    expect(searchManual(actor(), "en", word).some((hit) => hit.articleId === "organizations")).toBe(
      false,
    );
  });

  it("opens on the manual of the reader's own role", async () => {
    expect((await getManual(actor({ roles: ["TEACHER"] }), "en")).audience).toBe("TEACHER");
    expect((await getManual(actor({ roles: ["CASHIER", "TEACHER"] }), "en")).audience).toBe(
      "CASHIER",
    );
    expect((await getManual(actor({ roles: ["CEO"] }), "en")).audience).toBe("CEO");
  });

  it("points every picture at a file the site really has, in all three languages", async () => {
    for (const locale of locales) {
      const manual = await getManual(actor({ isSiteOwner: true }), locale);
      expect(manual.locale).toBe(locale);
      const pictures = manual.articles.flatMap((a) =>
        a.sections.flatMap((s) => [...(s.screenshot ? [s.screenshot] : []), ...s.more]),
      );
      expect(pictures.length).toBeGreaterThan(50);
      for (const picture of pictures) {
        expect(picture.src.startsWith(`/help/${locale}/`)).toBe(true);
        expect(existsSync(path.join(process.cwd(), "public", picture.src)), picture.src).toBe(true);
      }
    }
  });

  it("says each picture's own size, so the app keeps the right room for it", async () => {
    const manual = await getManual(actor(), "en");
    const pictures = manual.articles.flatMap((a) =>
      a.sections.flatMap((s) => [...(s.screenshot ? [s.screenshot] : []), ...s.more]),
    );
    // Most are a page of the site; a phone's screen is taller than it is wide.
    expect(pictures.filter((p) => p.width === 1280 && p.height === 800).length).toBeGreaterThan(50);
    expect(pictures.some((p) => p.height > p.width)).toBe(true);
    for (const picture of pictures) {
      expect(picture.width).toBeGreaterThan(100);
      expect(picture.height).toBeGreaterThan(100);
    }
  });

  it("reads a size from a JPEG's header and nothing from other bytes", async () => {
    const page = readFileSync(path.join(process.cwd(), "public/help/en/dashboard.jpg"));
    expect(jpegSize(page)).toEqual({ width: 1280, height: 800 });
    expect(jpegSize(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(jpegSize(page.subarray(0, 12))).toBeNull();
    // A picture the server does not have counts as a page of the site.
    expect(await helpPictureSize("en", "no-such-picture")).toEqual(PAGE_PICTURE);
  });

  it("offers a section's video only where the server has the file in that language", async () => {
    const english = await getManual(actor(), "en");
    const videos = english.articles.flatMap((a) =>
      a.sections.flatMap((s) => (s.video ? [s.video] : [])),
    );
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({ id: "sign-in", src: "/api/v1/help-videos/en/sign-in" });
    expect(videos[0]!.title).not.toBe("");
    const russian = await getManual(actor(), "ru");
    expect(russian.articles.every((a) => a.sections.every((s) => s.video === null))).toBe(true);
  });

  it("answers in Uzbek when the language asked for is none of the three", () => {
    expect(manualLocale("ru")).toBe("ru");
    expect(manualLocale("de")).toBe("uz");
    expect(manualLocale(null)).toBe("uz");
  });

  it("searches with the site's own search", () => {
    const hits = searchManual(actor(), "en", "refund");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({ slug: "payments", sectionId: "refund" });
    expect(searchManual(actor(), "en", "x")).toEqual([]);
  });
});
