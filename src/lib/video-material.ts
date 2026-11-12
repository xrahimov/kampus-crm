/*
 * A lesson material shown on everyone's stage in a video lesson (A-183): how a
 * browser should display it, and where a video or audio file should be right
 * now when the teacher leads the playback. Shared by the server and the room.
 */

/** How the room displays a shown material. */
export type MaterialView =
  /** Pages drawn in the room; the teacher turns them for everyone. */
  | "pdf"
  | "image"
  /** Played in step with the teacher's player. */
  | "video"
  | "audio"
  /** A YouTube link, embedded; everyone presses play themselves. */
  | "youtube"
  /** Any other link: a card with a button that opens it. */
  | "link"
  /** A file a browser cannot draw (Word, PowerPoint, Excel, zip): a card with a button. */
  | "file";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "m4v", "mov"];
const AUDIO_EXTENSIONS = ["mp3", "m4a", "ogg", "weba", "wav"];

function extensionOf(url: string): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

/** The 11-character id of a YouTube video link, or null. */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = parsed.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else {
      const m = /^\/(embed|shorts|live)\/([^/]+)/.exec(parsed.pathname);
      id = m ? m[2]! : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function materialView(kind: "FILE" | "LINK" | "RECORDING", url: string): MaterialView {
  if (kind === "RECORDING") return "video";
  if (kind === "LINK") return youtubeId(url) ? "youtube" : "link";
  const ext = extensionOf(url);
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  return "file";
}

/** Views the teacher can draw over with the pen (one page that looks the same for everyone). */
export function canAnnotate(view: MaterialView): boolean {
  return view === "pdf" || view === "image";
}

/** Playback as the teacher last set it: `position` seconds at the moment `at`. */
export interface Playback {
  playing: boolean;
  position: number;
  /** ISO time (server clock) of the teacher's last play, pause or jump. */
  at: string;
}

/**
 * Where the file should be at `nowMs` (server clock, milliseconds): the stored
 * position while paused, and that plus the time gone by while playing.
 */
export function expectedPosition(playback: Playback, nowMs: number): number {
  if (!playback.playing) return playback.position;
  const since = Date.parse(playback.at);
  if (!Number.isFinite(since)) return playback.position;
  return playback.position + Math.max(0, nowMs - since) / 1000;
}

/** A follower jumps only when it is this far from the teacher; smaller gaps are left alone. */
export const PLAYBACK_DRIFT_SEC = 1.5;

export function needsSeek(current: number, expected: number): boolean {
  return Math.abs(current - expected) > PLAYBACK_DRIFT_SEC;
}

/** The whiteboard layer for pen marks over one page of a shown material. */
export function annotationLayer(materialId: string, page: number): string {
  return `m:${materialId}:${page}`;
}
