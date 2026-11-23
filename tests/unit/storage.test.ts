import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ATTACHMENT_TYPES,
  IMAGE_TYPES,
  LocalStorage,
  newStorageKey,
  uploadType,
} from "@/server/storage/local";

let dir: string;
let storage: LocalStorage;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kampus-storage-"));
  storage = new LocalStorage(dir);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("local storage", () => {
  it("stores and reads back a file under a generated key", async () => {
    const key = newStorageKey("photos", "image/png");
    expect(key).toMatch(/^photos\/[a-f0-9]{32}\.png$/);
    const data = new Uint8Array([137, 80, 78, 71]);
    const stored = await storage.put(key, data, "image/png");
    expect(stored.size).toBe(4);
    const read = await storage.get(key);
    expect(read?.contentType).toBe("image/png");
    expect(Array.from(read!.data)).toEqual([137, 80, 78, 71]);
  });

  it("returns null for a missing key and refuses keys that leave the folder", async () => {
    expect(await storage.get(newStorageKey("photos", "image/jpeg"))).toBeNull();
    expect(await storage.get("../../etc/passwd")).toBeNull();
    await expect(storage.put("../x.png", new Uint8Array(), "image/png")).rejects.toThrow(
      "Invalid storage key",
    );
    expect(() => newStorageKey("photos", "text/html")).toThrow();
  });
});

describe("the type an upload is stored as (A-226)", () => {
  it("keeps a type the server knows, whatever its case or parameters", () => {
    expect(uploadType({ type: "audio/mp4" }, ATTACHMENT_TYPES)).toBe("audio/mp4");
    expect(uploadType({ type: "Audio/WebM;codecs=opus" }, ATTACHMENT_TYPES)).toBe("audio/webm");
  });

  it("takes an iPhone's voice recording, which arrives as audio/x-m4a", () => {
    const type = uploadType({ type: "audio/x-m4a", name: "answer.m4a" }, ATTACHMENT_TYPES);
    expect(type).toBe("audio/mp4");
    expect(newStorageKey("homework", type!)).toMatch(/\.m4a$/);
  });

  it("knows the other names devices give the same types", () => {
    expect(uploadType({ type: "application/x-zip-compressed" }, ATTACHMENT_TYPES)).toBe(
      "application/zip",
    );
    expect(uploadType({ type: "audio/vnd.wave" }, ATTACHMENT_TYPES)).toBe("audio/wav");
    expect(uploadType({ type: "image/jpg" }, IMAGE_TYPES)).toBe("image/jpeg");
  });

  it("goes by the name's ending only when the file came with no type", () => {
    expect(uploadType({ type: "", name: "Notes.PDF" }, ATTACHMENT_TYPES)).toBe("application/pdf");
    expect(
      uploadType({ type: "application/octet-stream", name: "talk.weba" }, ATTACHMENT_TYPES),
    ).toBe("audio/webm");
    expect(uploadType({ type: "application/octet-stream", name: "me.jpeg" }, IMAGE_TYPES)).toBe(
      "image/jpeg",
    );
    // A named type that is not accepted stays refused, whatever the file is called.
    expect(uploadType({ type: "text/html", name: "page.pdf" }, ATTACHMENT_TYPES)).toBeNull();
    expect(uploadType({ type: "", name: "run.exe" }, ATTACHMENT_TYPES)).toBeNull();
    expect(uploadType({ type: "", name: "no-ending" }, ATTACHMENT_TYPES)).toBeNull();
  });

  it("holds each upload to its own list", () => {
    expect(uploadType({ type: "application/pdf", name: "a.pdf" }, IMAGE_TYPES)).toBeNull();
    expect(uploadType({ type: "", name: "a.pdf" }, IMAGE_TYPES)).toBeNull();
    expect(uploadType({ type: "application/vnd.apple.mpegurl" }, ATTACHMENT_TYPES)).toBeNull();
  });
});
