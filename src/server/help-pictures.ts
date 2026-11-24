import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * How large a picture of the manual is (A-252). The site lays its pictures out
 * in the browser, which learns a picture's size by loading it; the phone app
 * has to keep room for a picture before it arrives, or the article jumps under
 * the reader's thumb. So the manual's data says each picture's size, read here
 * from the file itself.
 */

export interface PictureSize {
  width: number;
  height: number;
}

/** What most of the manual's pictures are: one page of the site. */
export const PAGE_PICTURE: PictureSize = { width: 1280, height: 800 };

/**
 * The size written in a JPEG file's own header, or null when the bytes are not
 * a JPEG that says one. A JPEG is a row of blocks, each with a mark and a
 * length; the "start of frame" block carries the height and the width.
 */
export function jpegSize(bytes: Uint8Array): PictureSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const mark = bytes[at + 1]!;
    // Fill bytes before a mark.
    if (mark === 0xff) {
      at += 1;
      continue;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    // C0 to CF are the frame blocks, except the three that are tables.
    if (mark >= 0xc0 && mark <= 0xcf && mark !== 0xc4 && mark !== 0xc8 && mark !== 0xcc) {
      const height = (bytes[at + 5]! << 8) | bytes[at + 6]!;
      const width = (bytes[at + 7]! << 8) | bytes[at + 8]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

const known = new Map<string, Promise<PictureSize>>();

/**
 * The size of `public/help/<locale>/<name>.jpg`. The pictures are part of the
 * build and do not change while the server runs, so each is read once. A file
 * that cannot be read counts as a page of the site, the commonest size.
 */
export function helpPictureSize(locale: string, name: string): Promise<PictureSize> {
  const file = path.join(
    /*turbopackIgnore: true*/ process.cwd(),
    "public",
    "help",
    locale,
    `${name}.jpg`,
  );
  let size = known.get(file);
  if (!size) {
    size = readFile(/*turbopackIgnore: true*/ file)
      .then((bytes) => jpegSize(bytes) ?? PAGE_PICTURE)
      .catch(() => PAGE_PICTURE);
    known.set(file, size);
  }
  return size;
}
