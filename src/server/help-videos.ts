import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import {
  HELP_VIDEO_IDS,
  appHelpVideoFile,
  helpVideoFile,
  isAppHelpVideoId,
  isHelpVideoId,
  isHelpVideoLocale,
  type HelpVideoId,
} from "@/features/help/videos";

import type { StoredRange } from "./storage/storage";

/**
 * The how-to videos the manual plays (A-199). They are files recorded outside
 * the repository, copied into one folder beside the app: `<folder>/<language>/
 * 01-sign-in.mp4` and so on, exactly as the recorder writes them. A video that
 * is not in the folder is simply not offered, so a server without the folder
 * shows the manual as before.
 */
export function helpVideosDir(): string {
  // The folder is configuration, not part of the project: the hints below keep the
  // bundler from packing the whole repository into the server output because of it.
  return path.resolve(/*turbopackIgnore: true*/ process.env.HELP_VIDEOS_DIR || "help-videos");
}

const NONE: ReadonlySet<HelpVideoId> = new Set();
/** How long a look into the folder is trusted: new files show up within a minute. */
const FRESH_MS = 60_000;
const seen = new Map<string, { at: number; ids: ReadonlySet<HelpVideoId> }>();

/** Which videos exist in `locale`. Reads the folder at most once a minute. */
export async function availableHelpVideos(locale: string): Promise<ReadonlySet<HelpVideoId>> {
  if (!isHelpVideoLocale(locale)) return NONE;
  const dir = path.join(/*turbopackIgnore: true*/ helpVideosDir(), locale);
  const known = seen.get(dir);
  if (known && Date.now() - known.at < FRESH_MS) return known.ids;
  let names: string[];
  try {
    names = await readdir(/*turbopackIgnore: true*/ dir);
  } catch {
    names = [];
  }
  const files = new Set(names);
  const ids = new Set(HELP_VIDEO_IDS.filter((id) => files.has(helpVideoFile(id))));
  seen.set(dir, { at: Date.now(), ids });
  return ids;
}

/** Forgets what was seen in the folder (tests put files there and look again). */
export function forgetHelpVideos(): void {
  seen.clear();
}

/**
 * The bytes of one video, or the part of it a browser asks for while seeking.
 * The path is built from the two lists the app knows, never from what was typed.
 */
export async function helpVideoRange(
  locale: string,
  id: string,
  start = 0,
  end?: number,
): Promise<StoredRange | null> {
  if (!isHelpVideoLocale(locale)) return null;
  // The site's videos, or the ones recorded in the phone app (A-229).
  const name = isHelpVideoId(id)
    ? helpVideoFile(id)
    : isAppHelpVideoId(id)
      ? appHelpVideoFile(id)
      : null;
  if (!name) return null;
  const file = path.join(/*turbopackIgnore: true*/ helpVideosDir(), locale, name);
  let size: number;
  try {
    const info = await stat(/*turbopackIgnore: true*/ file);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null;
  }
  const last = Math.min(end ?? size - 1, size - 1);
  if (size === 0 || start > last) {
    return {
      stream: new ReadableStream({ start: (c) => c.close() }),
      start,
      end: last,
      size,
      contentType: "video/mp4",
    };
  }
  const stream = Readable.toWeb(
    createReadStream(/*turbopackIgnore: true*/ file, { start, end: last }),
  ) as ReadableStream<Uint8Array>;
  return { stream, start, end: last, size, contentType: "video/mp4" };
}
