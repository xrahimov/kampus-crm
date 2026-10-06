import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { STORAGE_KEY_PATTERN, type Storage, type StoredFile } from "./storage";

const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
/** Documents, audio and short video that homework and lesson materials may carry. */
const DOCUMENT_EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
const EXTENSION_BY_TYPE: Record<string, string> = {
  ...IMAGE_EXTENSION_BY_TYPE,
  ...DOCUMENT_EXTENSION_BY_TYPE,
};
const TYPE_BY_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
);

export const IMAGE_TYPES = Object.keys(IMAGE_EXTENSION_BY_TYPE);
/** Everything an attachment may be: images plus the document types above. */
export const ATTACHMENT_TYPES = Object.keys(EXTENSION_BY_TYPE);

/** Builds a key for a new upload; the extension follows the content type. */
export function newStorageKey(folder: string, contentType: string): string {
  const ext = EXTENSION_BY_TYPE[contentType];
  if (!ext) throw new Error(`Unsupported content type ${contentType}`);
  return `${folder}/${randomBytes(16).toString("hex")}.${ext}`;
}

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredFile> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    return { key, contentType, size: data.byteLength };
  }

  async get(key: string) {
    if (!STORAGE_KEY_PATTERN.test(key)) return null;
    try {
      const data = await readFile(this.resolve(key));
      const ext = key.slice(key.lastIndexOf(".") + 1);
      return { data, contentType: TYPE_BY_EXTENSION[ext] ?? "application/octet-stream" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}

const globalForStorage = globalThis as unknown as { storage?: Storage };

export function getStorage(): Storage {
  // The directory is configuration, not a module to trace; hence the ignore hint for the bundler.
  globalForStorage.storage ??= new LocalStorage(
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR ?? "uploads"),
  );
  return globalForStorage.storage;
}
