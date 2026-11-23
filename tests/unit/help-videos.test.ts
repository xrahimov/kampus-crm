import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WORDS } from "../../scripts/tutorial-videos/words";
import { HELP_ARTICLES, type HelpSectionSpec } from "@/features/help/catalog";
import {
  APP_HELP_VIDEO_IDS,
  HELP_VIDEO_IDS,
  HELP_VIDEO_LOCALES,
  HELP_VIDEO_TEXT,
  appHelpVideoFile,
  helpVideoFile,
  helpVideoSrc,
} from "@/features/help/videos";
import { availableHelpVideos, forgetHelpVideos, helpVideoRange } from "@/server/help-videos";
import { fileResponse } from "@/server/storage/http";

describe("how-to videos in the manual (A-199)", () => {
  it("lists the videos in the recorder's order, so file names match", () => {
    expect([...HELP_VIDEO_IDS]).toEqual(Object.keys(WORDS.en.videos));
    expect(helpVideoFile("sign-in")).toBe("01-sign-in.mp4");
    expect(helpVideoFile("assistant")).toBe("23-assistant.mp4");
    expect(helpVideoSrc("uz", "groups")).toBe("/api/v1/help-videos/uz/groups");
  });

  it("names each video as its own opening card does, in every language", () => {
    for (const locale of HELP_VIDEO_LOCALES) {
      for (const id of HELP_VIDEO_IDS) {
        const { title, note } = WORDS[locale].videos[id];
        expect(HELP_VIDEO_TEXT[locale][id], `${locale} ${id}`).toEqual({ title, note });
      }
    }
  });

  it("puts every video in exactly one section of the manual", () => {
    const placed = HELP_ARTICLES.flatMap((article) =>
      (article.sections as readonly HelpSectionSpec[]).flatMap((s) => (s.video ? [s.video] : [])),
    );
    expect([...placed].sort()).toEqual([...HELP_VIDEO_IDS].sort());
  });
});

describe("the folder of how-to videos", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "help-videos-"));
  const before = process.env.HELP_VIDEOS_DIR;
  const bytes = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

  beforeAll(() => {
    process.env.HELP_VIDEOS_DIR = dir;
    mkdirSync(path.join(dir, "en"));
    mkdirSync(path.join(dir, "uz"));
    writeFileSync(path.join(dir, "en", "01-sign-in.mp4"), bytes);
    writeFileSync(path.join(dir, "en", "07-groups.mp4"), bytes);
    // Not a video of the list, and a video under a wrong number: neither is offered.
    writeFileSync(path.join(dir, "en", "notes.txt"), "x");
    writeFileSync(path.join(dir, "uz", "02-sign-in.mp4"), bytes);
    // The phone app's own video of signing in (A-229), in its folder beside the site's.
    mkdirSync(path.join(dir, "en", "app"));
    writeFileSync(path.join(dir, "en", "app", "01-sign-in.mp4"), bytes.subarray(0, 40));
    forgetHelpVideos();
  });
  afterAll(() => {
    if (before === undefined) delete process.env.HELP_VIDEOS_DIR;
    else process.env.HELP_VIDEOS_DIR = before;
    rmSync(dir, { recursive: true, force: true });
    forgetHelpVideos();
  });

  it("offers exactly the videos whose files are there", async () => {
    expect([...(await availableHelpVideos("en"))].sort()).toEqual(["groups", "sign-in"]);
    expect((await availableHelpVideos("uz")).size).toBe(0);
    // A language without a folder, and one the videos do not come in.
    expect((await availableHelpVideos("ru")).size).toBe(0);
    expect((await availableHelpVideos("de")).size).toBe(0);
  });

  it("reads only files of the list, whatever is asked for", async () => {
    expect(await helpVideoRange("en", "sign-in")).not.toBeNull();
    expect(await helpVideoRange("en", "dashboard")).toBeNull();
    expect(await helpVideoRange("en", "../en/01-sign-in")).toBeNull();
    expect(await helpVideoRange("en", "notes.txt")).toBeNull();
    expect(await helpVideoRange("..", "sign-in")).toBeNull();
    expect(await helpVideoRange("ru", "sign-in")).toBeNull();
  });

  it("keeps the videos recorded in the phone app apart from the site's (A-229)", async () => {
    expect([...APP_HELP_VIDEO_IDS].map(appHelpVideoFile)).toEqual([
      "app/01-sign-in.mp4",
      "app/02-student.mp4",
    ]);
    // The recorder writes them under these names, in this order, in every language.
    expect(APP_HELP_VIDEO_IDS.map((id) => id.slice("app-".length))).toEqual(
      Object.keys(WORDS.en.appVideos),
    );
    for (const locale of HELP_VIDEO_LOCALES) {
      for (const [id, video] of Object.entries(WORDS[locale].appVideos)) {
        expect(video.title, `${locale} ${id}`).not.toBe("");
        // An upright video's band holds four lines: about 160 characters.
        for (const [step, text] of Object.entries(video.steps)) {
          expect(text.length, `${locale} ${id} ${step}`).toBeLessThanOrEqual(170);
        }
      }
    }
    // The app's video is its own file, not the site's of the same subject.
    expect((await helpVideoRange("en", "app-sign-in"))?.size).toBe(40);
    expect((await helpVideoRange("en", "sign-in"))?.size).toBe(100);
    // Not recorded yet, another language, and names that only look like one.
    expect(await helpVideoRange("en", "app-student")).toBeNull();
    expect(await helpVideoRange("uz", "app-sign-in")).toBeNull();
    expect(await helpVideoRange("en", "app-groups")).toBeNull();
    expect(await helpVideoRange("en", "app/01-sign-in")).toBeNull();
    // The manual's list is the site's videos only.
    expect([...(await availableHelpVideos("en"))].sort()).toEqual(["groups", "sign-in"]);
  });

  it("answers a browser that seeks with the part it asked for", async () => {
    const storage = {
      getRange: (_key: string, start?: number, end?: number) =>
        helpVideoRange("en", "sign-in", start, end),
    };
    const whole = await fileResponse(storage, "", new Request("http://x/"), "public");
    expect(whole?.status).toBe(200);
    expect(whole?.headers.get("content-type")).toBe("video/mp4");
    expect(whole?.headers.get("content-length")).toBe("100");
    expect(whole?.headers.get("accept-ranges")).toBe("bytes");

    const part = await fileResponse(
      storage,
      "",
      new Request("http://x/", { headers: { range: "bytes=10-19" } }),
      "public",
    );
    expect(part?.status).toBe(206);
    expect(part?.headers.get("content-range")).toBe("bytes 10-19/100");
    expect([...new Uint8Array(await part!.arrayBuffer())]).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);

    const beyond = await fileResponse(
      storage,
      "",
      new Request("http://x/", { headers: { range: "bytes=500-" } }),
      "public",
    );
    expect(beyond?.status).toBe(416);
  });
});
