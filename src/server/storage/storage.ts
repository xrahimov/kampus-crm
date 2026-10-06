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

export interface StoredRange {
  /** Bytes [start, end] of the file, inclusive. */
  stream: ReadableStream<Uint8Array>;
  start: number;
  end: number;
  size: number;
  contentType: string;
}

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredFile>;
  /**
   * Writes a large upload (a lesson recording) as it arrives, giving up past
   * `maxBytes` with a `TOO_LARGE` error and nothing kept.
   */
  putStream(
    key: string,
    data: ReadableStream<Uint8Array>,
    contentType: string,
    maxBytes: number,
  ): Promise<StoredFile>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<{ data: Uint8Array; contentType: string } | null>;
  /** Removes a file; a missing key is not an error. */
  delete(key: string): Promise<void>;
  /** A byte range of the file for streaming playback; null when the key does not exist. */
  getRange(key: string, start?: number, end?: number): Promise<StoredRange | null>;
}

/** Only keys we generate: `<folder>/<hex>.<ext>`, no dots or slashes beyond that. */
export const STORAGE_KEY_PATTERN = /^[a-z]+\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
