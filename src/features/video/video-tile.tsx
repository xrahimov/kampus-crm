"use client";

import { Hand, MicOff, MonitorUp, Pin, Star, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

let sharedContext: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  sharedContext ??= new AudioContext();
  if (sharedContext.state === "suspended") void sharedContext.resume().catch(() => undefined);
  return sharedContext;
}

/** True while the stream's microphone is above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);
  const trackId = stream?.getAudioTracks()[0]?.id ?? null;
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    const ctx = enabled && track ? audioContext() : null;
    if (!ctx || !track) return;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let quietFor = 0;
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) * (v - 128);
      const loud = Math.sqrt(sum / data.length) > 6;
      quietFor = loud ? 0 : quietFor + 1;
      setSpeaking(loud || quietFor < 4);
    }, 150);
    return () => {
      clearInterval(timer);
      source.disconnect();
      setSpeaking(false);
    };
  }, [stream, trackId, enabled]);
  return speaking;
}

/** One person's picture in a call, with their name and muted / camera-off marks. */
export function VideoTile({
  stream,
  name,
  isSelf = false,
  audioOn,
  videoOn,
  screen = false,
  hand = false,
  handPlace,
  reaction,
  spotlight = false,
  status,
  pinned = false,
  onPin,
  className,
  testId,
}: {
  stream: MediaStream | null;
  name: string;
  isSelf?: boolean;
  audioOn: boolean;
  videoOn: boolean;
  screen?: boolean;
  hand?: boolean;
  /** Place in the raised-hand queue, shown on the hand mark. */
  handPlace?: number;
  /** A reaction floating over the picture; the key restarts the animation. */
  reaction?: { key: number; emoji: string };
  /** The teacher put this person on everyone's stage. */
  spotlight?: boolean;
  /** Shown over the picture while the connection is not up. */
  status?: string | null;
  pinned?: boolean;
  onPin?: () => void;
  className?: string;
  testId?: string;
}) {
  const t = useTranslations("video.room");
  const ref = useRef<HTMLVideoElement>(null);
  const speaking = useSpeaking(stream, audioOn);
  const videoTrackId = stream?.getVideoTracks()[0]?.id ?? null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream, videoTrackId]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div
      data-testid={testId}
      data-speaking={speaking || undefined}
      className={cn(
        "group/tile relative isolate overflow-hidden rounded-lg bg-sidebar-muted ring-2 ring-transparent transition-shadow",
        speaking && "ring-sidebar-active",
        className,
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isSelf}
        className={cn(
          "size-full object-cover",
          screen && "object-contain",
          isSelf && !screen && "-scale-x-100",
          !videoOn && "invisible",
        )}
      />
      {!videoOn && (
        <div className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="grid size-16 place-items-center rounded-full bg-sidebar text-xl font-semibold text-sidebar-foreground sm:size-20 sm:text-2xl">
            {initials || "?"}
          </span>
        </div>
      )}
      {hand && (
        <div
          className="absolute top-2 left-2 flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-md bg-amber-400 px-1.5 text-sm font-semibold text-sidebar shadow"
          aria-label={handPlace ? t("handPlace", { place: handPlace }) : t("handRaised")}
          role="img"
          data-testid="hand-mark"
        >
          <Hand className="size-4" />
          {handPlace && <span>{handPlace}</span>}
        </div>
      )}
      {spotlight && (
        <div
          className="absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs text-white"
          data-testid="spotlight-mark"
        >
          <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
          {t("spotlighted")}
        </div>
      )}
      {reaction && (
        <div
          key={reaction.key}
          className="pointer-events-none absolute right-3 bottom-10 animate-in text-4xl duration-300 fade-in zoom-in-50 motion-reduce:animate-none sm:text-5xl"
          aria-hidden
          data-testid="reaction-mark"
        >
          {reaction.emoji}
        </div>
      )}
      {status && (
        <div className="absolute inset-0 grid place-items-center bg-sidebar/70 px-4 text-center text-sm text-sidebar-foreground">
          {status}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2.5 pt-6 pb-2 text-sm text-white">
        {!audioOn && <MicOff className="size-3.5 shrink-0 text-red-300" aria-label={t("muted")} />}
        {!videoOn && <VideoOff className="size-3.5 shrink-0 opacity-80" aria-hidden />}
        {screen && <MonitorUp className="size-3.5 shrink-0" aria-label={t("sharing")} />}
        <span className="truncate">{isSelf ? t("you", { name }) : name}</span>
      </div>
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          aria-pressed={pinned}
          aria-label={pinned ? t("unpin") : t("pin")}
          className={cn(
            "absolute top-2 right-2 grid size-8 place-items-center rounded-md bg-black/45 text-white opacity-0 transition-opacity group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-sidebar-active",
            pinned && "opacity-100",
          )}
        >
          <Pin className="size-4" />
        </button>
      )}
    </div>
  );
}
