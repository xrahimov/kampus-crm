"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/*
 * The video player for recordings and lesson videos (A-175): plays the HLS
 * streaming copy when there is one (natively on iPhone, through hls.js
 * elsewhere), falls back to the plain file, remembers the speed, continues
 * where the viewer stopped and reports the position so the teacher sees who
 * watched. Controls are the browser's own; only the speed row is ours.
 */

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const RATE_KEY = "kampus.videoRate";
const POSITION_PREFIX = "kampus.videoPos.";
/** The position is reported this often while playing. */
const REPORT_EVERY_MS = 10_000;
/** A position this close to either end is not worth continuing from. */
const EDGE_SEC = 5;

const rateListeners = new Set<() => void>();
function readRate(): number {
  try {
    const n = Number(localStorage.getItem(RATE_KEY));
    return (PLAYBACK_RATES as readonly number[]).includes(n) ? n : 1;
  } catch {
    return 1;
  }
}
function writeRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    /* private window */
  }
  rateListeners.forEach((l) => l());
}
function subscribeRate(listener: () => void): () => void {
  rateListeners.add(listener);
  return () => rateListeners.delete(listener);
}

function readPosition(key: string): number | null {
  try {
    const n = Number(localStorage.getItem(POSITION_PREFIX + key));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function writePosition(key: string, seconds: number): void {
  try {
    localStorage.setItem(POSITION_PREFIX + key, String(Math.round(seconds)));
  } catch {
    /* private window */
  }
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(rest).padStart(2, "0")}`;
}

export interface VideoPlayerProps {
  /** The plain video file. */
  src: string;
  /** HLS master playlist of the streaming copy, when the worker made one. */
  hlsSrc?: string | null;
  title?: string;
  /** Where the viewer stopped, as the server remembers it; the browser's own memory is the fallback. */
  resumeSec?: number | null;
  /** Identifies the video in the browser's memory of positions. */
  storageKey: string;
  /** Called with the position every few seconds while playing, and on pause and end. */
  onProgress?: (positionSec: number, durationSec: number | null) => void;
  /** Hides the speed row (small previews). */
  compact?: boolean;
  className?: string;
  testId?: string;
}

export function VideoPlayer({
  src,
  hlsSrc,
  title,
  resumeSec,
  storageKey,
  onProgress,
  compact = false,
  className,
  testId = "video-player",
}: VideoPlayerProps) {
  const t = useTranslations("video.player");
  const ref = useRef<HTMLVideoElement>(null);
  const rate = useSyncExternalStore(subscribeRate, readRate, () => 1);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const lastReport = useRef(0);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Attach the source: native HLS, hls.js over MSE, or the plain file.
  useEffect(() => {
    const video = ref.current;
    if (!video || !hlsSrc) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsSrc;
      return;
    }
    let cancelled = false;
    let instance: { destroy(): void } | null = null;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        video.src = src;
        return;
      }
      const hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(hlsSrc);
      hls.attachMedia(video);
      instance = hls;
    });
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [hlsSrc, src]);

  useEffect(() => {
    const video = ref.current;
    if (video) video.playbackRate = rate;
  }, [rate]);

  const report = (video: HTMLVideoElement, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastReport.current < REPORT_EVERY_MS) return;
    lastReport.current = now;
    const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
    writePosition(storageKey, video.currentTime);
    onProgressRef.current?.(video.currentTime, duration);
  };

  return (
    <div className={cn("space-y-1.5", className)} data-testid={`${testId}-player`}>
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        {...(hlsSrc ? {} : { src })}
        aria-label={title}
        className="aspect-video w-full rounded-md bg-black"
        data-testid={testId}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          video.playbackRate = rate;
          const remembered = resumeSec ?? readPosition(storageKey);
          const duration = video.duration;
          if (
            remembered !== null &&
            remembered > EDGE_SEC &&
            (!Number.isFinite(duration) || remembered < duration - EDGE_SEC)
          ) {
            video.currentTime = remembered;
            setResumedFrom(remembered);
          }
        }}
        onTimeUpdate={(e) => report(e.currentTarget, false)}
        onPause={(e) => report(e.currentTarget, true)}
        onEnded={(e) => report(e.currentTarget, true)}
      />
      {!compact && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="mr-1">{t("speed")}</span>
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => writeRate(r)}
              aria-pressed={r === rate}
              className={cn(
                "rounded-full border px-2 py-0.5 tabular-nums",
                r === rate ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
              data-testid={`${testId}-rate-${String(r).replace(".", "_")}`}
            >
              {r}×
            </button>
          ))}
          {resumedFrom !== null && (
            <span className="ml-auto" data-testid={`${testId}-resumed`}>
              {t("resumed", { time: formatClock(resumedFrom) })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
