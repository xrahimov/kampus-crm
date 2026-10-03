import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalStorage, newStorageKey } from "@/server/storage/local";

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
