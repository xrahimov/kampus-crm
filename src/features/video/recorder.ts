import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/constants";

import type { CallEngine } from "./call-engine";

/*
 * Records a video lesson in the teacher's browser (A-105): a canvas shows the
 * shared screen when someone shares one, else the teacher's camera, and every
 * microphone in the room is mixed into one audio track. MediaRecorder turns
 * that into webm (mp4 in Safari); when the teacher stops, the file is uploaded
 * and becomes a material of the lesson.
 */

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 10;
const SOURCE_CHECK_MS = 1000;

export const RECORDING_MIME_TYPES = [
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

export function recordingMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDING_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export class CallRecorder {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private readonly video = document.createElement("video");
  private readonly audio = new AudioContext();
  private readonly mix = this.audio.createMediaStreamDestination();
  private readonly sources = new Map<string, MediaStreamAudioSourceNode>();
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private drawTimer: ReturnType<typeof setInterval> | null = null;
  private sourceTimer: ReturnType<typeof setInterval> | null = null;
  private currentTrack: MediaStreamTrack | null = null;
  readonly startedAt = Date.now();
  readonly mimeType: string;

  constructor(private readonly engine: CallEngine) {
    const mime = recordingMimeType();
    if (!mime) throw new Error("unsupported");
    this.mimeType = mime;
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.video.muted = true;
    this.video.playsInline = true;
  }

  start(): void {
    const stream = new MediaStream([
      ...this.canvas.captureStream(FPS).getVideoTracks(),
      ...this.mix.stream.getAudioTracks(),
    ]);
    this.recorder = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 500_000,
      audioBitsPerSecond: 48_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.syncSources();
    this.draw();
    this.recorder.start(5000);
    this.drawTimer = setInterval(() => this.draw(), 1000 / FPS);
    this.sourceTimer = setInterval(() => this.syncSources(), SOURCE_CHECK_MS);
  }

  /** Stops and returns the file plus its length in seconds. */
  stop(): Promise<{ blob: Blob; durationSec: number }> {
    return new Promise((resolve) => {
      const recorder = this.recorder;
      if (this.drawTimer) clearInterval(this.drawTimer);
      if (this.sourceTimer) clearInterval(this.sourceTimer);
      const finish = () => {
        for (const s of this.sources.values()) s.disconnect();
        this.sources.clear();
        void this.audio.close().catch(() => undefined);
        this.video.srcObject = null;
        resolve({
          blob: new Blob(this.chunks, { type: this.mimeType.split(";")[0] }),
          durationSec: (Date.now() - this.startedAt) / 1000,
        });
      };
      if (!recorder || recorder.state === "inactive") return finish();
      recorder.onstop = finish;
      recorder.stop();
    });
  }

  /** The picture to record: a shared screen if any, else the teacher's camera. */
  private pickVideoTrack(): MediaStreamTrack | null {
    const engine = this.engine;
    if (engine.media.screen) return engine.localStream.getVideoTracks()[0] ?? null;
    const sharer = engine.peers().find((p) => p.media?.screen);
    if (sharer) return sharer.stream.getVideoTracks()[0] ?? null;
    if (engine.media.video) return engine.localStream.getVideoTracks()[0] ?? null;
    return null;
  }

  private syncSources(): void {
    const streams = [this.engine.localStream, ...this.engine.peers().map((p) => p.stream)];
    const seen = new Set<string>();
    for (const stream of streams) {
      for (const track of stream.getAudioTracks()) {
        seen.add(track.id);
        if (this.sources.has(track.id)) continue;
        const source = this.audio.createMediaStreamSource(new MediaStream([track]));
        source.connect(this.mix);
        this.sources.set(track.id, source);
      }
    }
    for (const [id, source] of this.sources) {
      if (seen.has(id)) continue;
      source.disconnect();
      this.sources.delete(id);
    }
    if (this.audio.state === "suspended") void this.audio.resume().catch(() => undefined);

    const track = this.pickVideoTrack();
    if (track !== this.currentTrack) {
      this.currentTrack = track;
      this.video.srcObject = track ? new MediaStream([track]) : null;
      if (track) void this.video.play().catch(() => undefined);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const v = this.video;
    if (this.currentTrack && v.videoWidth > 0 && v.videoHeight > 0) {
      const scale = Math.min(WIDTH / v.videoWidth, HEIGHT / v.videoHeight);
      const w = v.videoWidth * scale;
      const h = v.videoHeight * scale;
      ctx.drawImage(v, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.engine.self.groupName, WIDTH / 2, HEIGHT / 2);
    }
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Sends the finished recording to the server, which files it under the lesson's materials. */
export async function uploadRecording(
  roomId: string,
  recording: { blob: Blob; durationSec: number },
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": recording.blob.type || "video/webm",
    Accept: "application/json",
  };
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf) headers[CSRF_HEADER] = csrf;
  const response = await fetch(
    `/api/v1/video/rooms/${roomId}/recording?duration=${Math.round(recording.durationSec)}`,
    { method: "POST", headers, credentials: "same-origin", body: recording.blob },
  );
  if (!response.ok) throw new Error(String(response.status));
}
