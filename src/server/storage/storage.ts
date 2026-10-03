/**
 * File storage behind an interface (ARCHITECTURE §2, A-22). Local disk in dev
 * and in the default Docker setup; an S3-compatible adapter can replace it
 * without touching the upload routes.
 */
export interface StoredFile {
  key: string;
  contentType: string;
  size: number;
}

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredFile>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>;
}

/** Only keys we generate: `<folder>/<hex>.<ext>`, no dots or slashes beyond that. */
export const STORAGE_KEY_PATTERN = /^[a-z]+\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
