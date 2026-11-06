import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { prisma, type DbClient } from "@/server/db/prisma";
import { getStorage } from "@/server/storage/local";
import type { Storage } from "@/server/storage/storage";

/*
 * Streaming copies of lesson recordings (online-lessons F3, A-175). A recording
 * arrives as the teacher's browser made it: one WebM or MP4 file at one quality,
 * which phones on a weak connection stall on and iPhones cannot play at all when
 * it is WebM. The worker turns it into HLS: H.264/AAC renditions, each one media
 * file with byte-range segments plus a playlist, and a master playlist that lets
 * the player pick the rendition the connection can carry. Files are served like
 * every upload, through /api/v1/files and the student's link, never directly.
 */

export interface HlsRendition {
  height: number;
  videoKbps: number;
  audioKbps: number;
}

/** Smallest first; renditions taller than the source are left out. */
export const HLS_RENDITIONS: readonly HlsRendition[] = [
  { height: 360, videoKbps: 700, audioKbps: 64 },
  { height: 720, videoKbps: 2000, audioKbps: 96 },
];

/** A streaming copy may grow this large per rendition file (a long 720p lesson is about 1.5 GB). */
const RENDITION_MAX_BYTES = 6 * 1024 * 1024 * 1024;
/** An ffmpeg run that takes longer than this is killed and the job retried later. */
const FFMPEG_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const PLAYLIST_TYPE = "application/vnd.apple.mpegurl";
const SEGMENT_TYPE = "video/iso.segment";

export interface TranscodeOptions {
  ffmpeg?: string;
  ffprobe?: string;
  tmpRoot?: string;
  /** Overrides the ladder (tests use a tiny one). */
  renditions?: readonly HlsRendition[];
}

export interface HlsResult {
  /** Key of the master playlist. */
  masterKey: string;
  /** Every key written, master included. */
  keys: string[];
  renditions: Array<{ height: number; width: number }>;
}

const hex = () => randomBytes(16).toString("hex");

function run(
  command: string,
  args: string[],
  timeoutMs = FFMPEG_TIMEOUT_MS,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString().slice(-4000)));
    // Lesson video is background work; the app and the database come first on a small server.
    try {
      if (child.pid) os.setPriority(child.pid, 19);
    } catch {
      /* not allowed on this platform */
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(new Error(`${path.basename(command)} exited with ${code}: ${stderr.slice(-600)}`));
    });
  });
}

/** Width and height of the first video stream. */
export async function probeDimensions(
  file: string,
  ffprobe = process.env.FFPROBE_PATH ?? "ffprobe",
): Promise<{ width: number; height: number }> {
  const { stdout } = await run(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0",
      file,
    ],
    60_000,
  );
  const [w, h] = stdout
    .trim()
    .split(/[,\s]+/)
    .map(Number);
  if (!w || !h) throw new Error("no video stream found");
  return { width: w, height: h };
}

/** The rungs of the ladder that make sense for a source of this height: never upscale, at least one. */
export function pickRenditions(
  sourceHeight: number,
  ladder: readonly HlsRendition[] = HLS_RENDITIONS,
): HlsRendition[] {
  const fitting = ladder.filter((r) => r.height <= sourceHeight);
  if (fitting.length > 0) return fitting;
  const smallest = ladder[0]!;
  return [{ ...smallest, height: sourceHeight - (sourceHeight % 2) }];
}

/**
 * Reads the source from storage, writes the renditions with ffmpeg and stores
 * them under new `hls/` keys (per rendition one media file and one playlist,
 * plus the master playlist). Throws when ffmpeg is missing or fails; the
 * caller decides whether to retry. Nothing is left behind in the temp folder.
 */
export async function transcodeToHls(
  storage: Storage,
  sourceKey: string,
  options: TranscodeOptions = {},
): Promise<HlsResult> {
  const ffmpeg = options.ffmpeg ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const ffprobe = options.ffprobe ?? process.env.FFPROBE_PATH ?? "ffprobe";
  const dir = await mkdtemp(path.join(options.tmpRoot ?? os.tmpdir(), "kampus-hls-"));
  const written: string[] = [];
  try {
    const source = await storage.getRange(sourceKey);
    if (!source) throw new Error(`source ${sourceKey} is gone`);
    const input = path.join(dir, `source.${sourceKey.split(".").pop()}`);
    await pipeline(
      Readable.fromWeb(source.stream as NodeReadableStream<Uint8Array>),
      createWriteStream(input),
    );
    const dims = await probeDimensions(input, ffprobe);
    const renditions = pickRenditions(dims.height, options.renditions);
    const master: string[] = ["#EXTM3U", "#EXT-X-VERSION:7"];
    const out: HlsResult["renditions"] = [];
    for (const r of renditions) {
      // One media file per rendition; its init section is a byte range of the same file.
      const names = { playlist: `${hex()}.m3u8`, media: `${hex()}.m4s` };
      const width = Math.round((dims.width * r.height) / dims.height / 2) * 2;
      await run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        input,
        "-vf",
        `scale=-2:${r.height}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-profile:v",
        "main",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        `${r.videoKbps}k`,
        "-maxrate",
        `${Math.round(r.videoKbps * 1.07)}k`,
        "-bufsize",
        `${Math.round(r.videoKbps * 1.5)}k`,
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        `${r.audioKbps}k`,
        "-ac",
        "2",
        "-threads",
        "2",
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "fmp4",
        "-hls_flags",
        "single_file",
        "-hls_segment_filename",
        path.join(dir, names.media),
        path.join(dir, names.playlist),
      ]);
      const mediaFile = path.join(dir, names.media);
      const { size } = await stat(mediaFile);
      await storage.putStream(
        `hls/${names.media}`,
        Readable.toWeb(createReadStream(mediaFile)) as ReadableStream<Uint8Array>,
        SEGMENT_TYPE,
        Math.max(size + 1, RENDITION_MAX_BYTES),
      );
      written.push(`hls/${names.media}`);
      const playlist = await readFile(path.join(dir, names.playlist));
      await storage.put(`hls/${names.playlist}`, new Uint8Array(playlist), PLAYLIST_TYPE);
      written.push(`hls/${names.playlist}`);
      const bandwidth = Math.round((r.videoKbps + r.audioKbps) * 1000 * 1.1);
      master.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${r.height},CODECS="avc1.4d401f,mp4a.40.2"`,
        names.playlist,
      );
      out.push({ height: r.height, width });
    }
    const masterKey = `hls/${hex()}.m3u8`;
    await storage.put(masterKey, new TextEncoder().encode(master.join("\n") + "\n"), PLAYLIST_TYPE);
    written.push(masterKey);
    return { masterKey, keys: written, renditions: out };
  } catch (error) {
    await Promise.all(written.map((key) => storage.delete(key).catch(() => undefined)));
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** True when a file is served from our storage and this is its key. */
export function storageKeyOf(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

/**
 * The `recording.hls` job: makes the streaming copy of one recording. Skips a
 * material that is gone, is not a recording or already has one. When the
 * material was deleted while ffmpeg ran, the copy is thrown away again.
 */
export async function makeRecordingStream(
  db: DbClient = prisma,
  materialId: string,
  options: TranscodeOptions & { storage?: Storage } = {},
): Promise<"done" | "skipped"> {
  const storage = options.storage ?? getStorage();
  const row = await db.lessonMaterial.findUnique({ where: { id: materialId } });
  if (!row || row.kind !== "RECORDING" || row.hlsKey) return "skipped";
  const sourceKey = storageKeyOf(row.url);
  if (!sourceKey || (await storage.size(sourceKey)) === null) return "skipped";
  const result = await transcodeToHls(storage, sourceKey, options);
  const updated = await db.lessonMaterial.updateMany({
    where: { id: materialId, hlsKey: null },
    data: { hlsKey: result.masterKey, hlsKeys: result.keys },
  });
  if (updated.count === 0) {
    await Promise.all(result.keys.map((key) => storage.delete(key).catch(() => undefined)));
    return "skipped";
  }
  return "done";
}

/** Removes a material's files from storage: the source (recordings only) and the streaming copy. */
export async function deleteMaterialFiles(
  storage: Storage,
  row: { kind: string; url: string; hlsKeys: string[] },
): Promise<void> {
  const keys = [...row.hlsKeys];
  // A recording exists for this one material only; uploaded files may be shared, so they stay.
  const source = row.kind === "RECORDING" ? storageKeyOf(row.url) : null;
  if (source) keys.push(source);
  await Promise.all(keys.map((key) => storage.delete(key).catch(() => undefined)));
}
