import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  annotationLayer,
  canAnnotate,
  expectedPosition,
  materialView,
  needsSeek,
  youtubeId,
} from "@/lib/video-material";
import { boardOpSchema, boardStrokeSchema, videoSyncSchema } from "@/lib/validation/video";

describe("materials shown in a video lesson (A-183)", () => {
  it("picks how a material is displayed from its kind and file type", () => {
    expect(materialView("FILE", "/api/v1/files/documents/a1b2.pdf")).toBe("pdf");
    expect(materialView("FILE", "/api/v1/public/class/tok/files/documents/a1b2.PDF")).toBe("pdf");
    expect(materialView("FILE", "/api/v1/files/boards/x.png")).toBe("image");
    expect(materialView("FILE", "/api/v1/files/documents/x.jpg?v=2")).toBe("image");
    expect(materialView("FILE", "/api/v1/files/documents/x.mp4")).toBe("video");
    expect(materialView("FILE", "/api/v1/files/documents/x.mp3")).toBe("audio");
    expect(materialView("FILE", "/api/v1/files/documents/x.weba")).toBe("audio");
    expect(materialView("FILE", "/api/v1/files/documents/x.docx")).toBe("file");
    expect(materialView("FILE", "/api/v1/files/documents/noextension")).toBe("file");
    expect(materialView("RECORDING", "/api/v1/files/recordings/x.webm")).toBe("video");
    expect(materialView("LINK", "https://example.com/grammar.pdf")).toBe("link");
    expect(materialView("LINK", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
  });

  it("reads the video id out of the usual YouTube addresses and nothing else", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("not a link")).toBeNull();
  });

  it("lets the pen draw over pages and pictures only", () => {
    expect(canAnnotate("pdf")).toBe(true);
    expect(canAnnotate("image")).toBe(true);
    expect(canAnnotate("video")).toBe(false);
    expect(canAnnotate("link")).toBe(false);
    expect(annotationLayer("mat1", 3)).toBe("m:mat1:3");
    expect(annotationLayer("mat1", 3)).not.toBe(annotationLayer("mat1", 4));
  });

  it("works out where a playing file should be, and when a follower must jump", () => {
    const at = "2026-11-12T10:00:00.000Z";
    const now = Date.parse(at);
    expect(expectedPosition({ playing: false, position: 30, at }, now + 60_000)).toBe(30);
    expect(expectedPosition({ playing: true, position: 30, at }, now + 4500)).toBe(34.5);
    // A browser whose clock is behind the stamp does not go backwards.
    expect(expectedPosition({ playing: true, position: 30, at }, now - 2000)).toBe(30);
    expect(expectedPosition({ playing: true, position: 30, at: "nonsense" }, now)).toBe(30);
    expect(needsSeek(34.0, 34.5)).toBe(false);
    expect(needsSeek(30, 34.5)).toBe(true);
    expect(needsSeek(40, 34.5)).toBe(true);
  });

  it("accepts the material in a stage change, with defaults, and refuses nonsense", () => {
    const base = { secret: "s".repeat(20), room: { spotlight: null, focus: false } };
    const parsed = videoSyncSchema.parse({
      ...base,
      room: { ...base.room, material: { id: "m1", title: "ignored", url: "/x" } },
    });
    expect(parsed.room?.material).toEqual({ id: "m1", page: 1, playing: false, position: 0 });
    expect(videoSyncSchema.parse(base).room?.material).toBeUndefined();
    expect(
      videoSyncSchema.parse({ ...base, room: { ...base.room, material: null } }).room?.material,
    ).toBeNull();
    expect(
      videoSyncSchema.safeParse({
        ...base,
        room: { ...base.room, material: { id: "m1", page: 0 } },
      }).success,
    ).toBe(false);
    expect(
      videoSyncSchema.safeParse({
        ...base,
        room: { ...base.room, material: { id: "m1", position: -1 } },
      }).success,
    ).toBe(false);
  });

  it("keeps pen marks per layer: the whiteboard by default, one page of a material otherwise", () => {
    const stroke = { id: "a", color: "#111827", width: 4, points: [[0.1, 0.2]] };
    expect(boardStrokeSchema.parse(stroke).layer).toBe("");
    expect(boardStrokeSchema.parse({ ...stroke, layer: "m:mat1:2" }).layer).toBe("m:mat1:2");
    expect(boardOpSchema.parse({ op: "clear" })).toEqual({ op: "clear", layer: "" });
    expect(boardStrokeSchema.safeParse({ ...stroke, layer: "x".repeat(200) }).success).toBe(false);
  });

  it("serves the PDF worker that belongs to the installed pdfjs-dist", () => {
    const root = path.join(__dirname, "..", "..");
    const packaged = readFileSync(
      path.join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"),
    );
    const served = readFileSync(path.join(root, "public/pdfjs/pdf.worker.min.mjs"));
    // Stale after a version bump: run `node scripts/copy-pdf-worker.mjs`.
    expect(served.equals(packaged)).toBe(true);
  });
});
