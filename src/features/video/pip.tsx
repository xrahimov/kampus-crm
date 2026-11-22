"use client";

import { ArrowUpLeft, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { VideoTile } from "./video-tile";

/*
 * The mini window (A-201): the lesson's pictures in a small always-on-top window
 * while the person works in another tab or program, as Google Meet does.
 *
 * Chrome and Edge on a computer have Document Picture-in-Picture: a real little
 * window this page renders into, with buttons. They also open it by themselves
 * when the person switches tabs during a call ("enterpictureinpicture" of the
 * Media Session API). Safari on a computer has only the older kind, one video
 * floating without buttons, opened by the button. Firefox, phones and tablets
 * get no mini window.
 */

interface DocumentPictureInPicture {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export type PipSupport = "window" | "video" | null;

export const PIP_WIDTH = 420;
export const PIP_HEIGHT = 300;

/** Which kind of mini window this browser can open. */
export function pipSupport(): PipSupport {
  if (typeof window === "undefined") return null;
  if (window.documentPictureInPicture) return "window";
  // A floating video on a phone or a tablet has not been tried with live calls; computers only.
  if (window.matchMedia?.("(pointer: coarse)").matches) return null;
  if (
    document.pictureInPictureEnabled &&
    typeof HTMLVideoElement.prototype.requestPictureInPicture === "function"
  ) {
    return "video";
  }
  return null;
}

/** Gives the mini window this page's styles, theme and language; waits for the style files. */
async function dress(win: Window, title: string): Promise<void> {
  const from = document;
  const to = win.document;
  to.title = title;
  to.documentElement.className = from.documentElement.className;
  to.documentElement.lang = from.documentElement.lang;
  to.documentElement.dir = from.documentElement.dir;
  to.documentElement.style.colorScheme = from.documentElement.style.colorScheme;
  const loads: Promise<void>[] = [];
  for (const sheet of Array.from(from.styleSheets)) {
    if (sheet.href) {
      // By address, so the font and picture addresses inside keep pointing at the right place.
      const link = to.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      loads.push(
        new Promise((resolve) => {
          link.onload = () => resolve();
          link.onerror = () => resolve();
        }),
      );
      to.head.appendChild(link);
      continue;
    }
    try {
      const style = to.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      to.head.appendChild(style);
    } catch {
      // A sheet this page may not read; the window does without it.
    }
  }
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 1500))]);
}

export interface Pip {
  support: PipSupport;
  /** The mini window to render into; null while closed, and always in "video" mode. */
  window: Window | null;
  /** True while the mini window (either kind) is on the screen. */
  open: boolean;
  /** The browser refused to open it after the button was pressed. */
  failed: boolean;
  /** "video" mode: the hidden video that floats. */
  videoRef: RefObject<HTMLVideoElement | null>;
  toggle: () => void;
  close: () => void;
  dismissFailed: () => void;
}

/**
 * The mini window of one call. It opens from the button, and by itself when the
 * browser says the person left the tab; one that opened by itself closes when
 * they come back. `title` names the little window.
 */
export function usePip(title: string): Pip {
  const support = pipSupport();
  const [shown, setShown] = useState<{ window: Window; auto: boolean } | null>(null);
  const [floating, setFloating] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const opening = useRef(false);

  const open = useCallback(
    async (auto: boolean) => {
      if (opening.current) return;
      opening.current = true;
      try {
        const api = window.documentPictureInPicture;
        if (api) {
          if (api.window) return;
          const win = await api.requestWindow({ width: PIP_WIDTH, height: PIP_HEIGHT });
          await dress(win, title);
          win.addEventListener(
            "pagehide",
            () => setShown((cur) => (cur?.window === win ? null : cur)),
            { once: true },
          );
          setShown({ window: win, auto });
        } else {
          const video = videoRef.current;
          if (!video || document.pictureInPictureElement) return;
          await video.play().catch(() => undefined);
          await video.requestPictureInPicture();
        }
        setFailed(false);
      } catch {
        // Opening by itself may be switched off in the browser; only the button complains.
        if (!auto) setFailed(true);
      } finally {
        opening.current = false;
      }
    },
    [title],
  );

  const close = useCallback(() => {
    window.documentPictureInPicture?.window?.close();
    setShown(null);
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined);
    }
  }, []);

  // Chrome and Edge call this when the person leaves the tab during a call.
  useEffect(() => {
    if (!support || !("mediaSession" in navigator)) return;
    const action = "enterpictureinpicture" as MediaSessionAction;
    try {
      navigator.mediaSession.setActionHandler(action, () => void open(true));
    } catch {
      return; // The browser does not know this action.
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Nothing to take back.
      }
    };
  }, [support, open]);

  // Back in the lesson's tab: a window that opened by itself is no longer needed.
  useEffect(() => {
    if (!shown?.auto) return;
    const back = () => {
      if (document.visibilityState !== "visible") return;
      shown.window.close();
      setShown(null);
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [shown]);

  // "video" mode: the browser tells when the video starts and stops floating.
  useEffect(() => {
    const video = videoRef.current;
    if (support !== "video" || !video) return;
    const enter = () => setFloating(true);
    const leave = () => setFloating(false);
    video.addEventListener("enterpictureinpicture", enter);
    video.addEventListener("leavepictureinpicture", leave);
    return () => {
      video.removeEventListener("enterpictureinpicture", enter);
      video.removeEventListener("leavepictureinpicture", leave);
    };
  }, [support]);

  // The call is over or the page goes: take the mini window along.
  useEffect(
    () => () => {
      window.documentPictureInPicture?.window?.close();
      if (document.pictureInPictureElement) {
        void document.exitPictureInPicture().catch(() => undefined);
      }
    },
    [],
  );

  const isOpen = shown !== null || floating;
  return {
    support,
    window: shown?.window ?? null,
    open: isOpen,
    failed,
    videoRef,
    toggle: () => (isOpen ? close() : void open(false)),
    close,
    dismissFailed: () => setFailed(false),
  };
}

/** One picture in the mini window. */
export interface PipTile {
  id: string;
  stream: MediaStream;
  name: string;
  isSelf: boolean;
  audioOn: boolean;
  videoOn: boolean;
  screen: boolean;
  hand: boolean;
}

/**
 * What the mini window shows: one big picture, up to three small ones when the
 * window is wide enough, and the buttons a person needs without going back
 * (microphone, camera, back to the lesson, leave). The pictures are silent:
 * the lesson's own tab keeps playing everyone's sound.
 */
export function PipView({
  win,
  tiles,
  note,
  audioOn,
  videoOn,
  hasAudio,
  hasCamera,
  onAudio,
  onVideo,
  onBack,
  onLeave,
}: {
  win: Window;
  tiles: PipTile[];
  /** A line above the pictures, such as "a file is open in the lesson". */
  note: string | null;
  audioOn: boolean;
  videoOn: boolean;
  hasAudio: boolean;
  hasCamera: boolean;
  onAudio: () => void;
  onVideo: () => void;
  onBack: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("video.room");
  const [lead, ...strip] = tiles;
  const tile = (p: PipTile, big: boolean) => (
    <VideoTile
      key={p.id}
      testId={big ? "pip-lead" : "pip-tile"}
      stream={p.stream}
      name={p.name}
      isSelf={p.isSelf}
      silent
      audioOn={p.audioOn}
      videoOn={p.videoOn}
      screen={p.screen}
      hand={p.hand}
      className={big ? "size-full" : "aspect-video"}
    />
  );
  return createPortal(
    <div
      className="fixed inset-0 flex flex-col gap-1.5 bg-sidebar p-1.5 text-sidebar-foreground"
      data-testid="pip-view"
    >
      {note && (
        <p className="shrink-0 rounded-md bg-sidebar-muted px-2 py-1 text-center text-xs text-white">
          {note}
        </p>
      )}
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="min-h-0 min-w-0 flex-1">{lead && tile(lead, true)}</div>
        {strip.length > 0 && (
          <div className="hidden w-28 shrink-0 flex-col gap-1.5 overflow-hidden min-[380px]:flex">
            {strip.map((p) => tile(p, false))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-center gap-1.5">
        <PipButton
          on={audioOn}
          disabled={!hasAudio}
          onClick={onAudio}
          label={audioOn ? t("mute") : t("unmute")}
          testId="pip-mic"
        >
          {audioOn ? <Mic /> : <MicOff />}
        </PipButton>
        <PipButton
          on={videoOn}
          disabled={!hasCamera}
          onClick={onVideo}
          label={videoOn ? t("cameraOff") : t("cameraOn")}
          testId="pip-camera"
        >
          {videoOn ? <Video /> : <VideoOff />}
        </PipButton>
        <PipButton on onClick={onBack} label={t("pipBack")} testId="pip-back">
          <ArrowUpLeft />
        </PipButton>
        <PipButton
          on
          onClick={onLeave}
          label={t("leave")}
          testId="pip-leave"
          className="!bg-destructive !text-destructive-foreground hover:!bg-destructive/90"
        >
          <PhoneOff />
        </PipButton>
      </div>
    </div>,
    win.document.body,
  );
}

function PipButton({
  on,
  disabled,
  onClick,
  label,
  testId,
  className,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active disabled:opacity-40 [&_svg]:size-4",
        on
          ? "bg-sidebar-muted text-white hover:bg-sidebar-muted/70"
          : "bg-white text-sidebar hover:bg-white/90",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * "video" mode: the one video that floats, kept out of sight in the page. It
 * carries the mini window's big picture and no sound.
 */
export function PipVideo({
  videoRef,
  stream,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
}) {
  const trackId = stream?.getVideoTracks()[0]?.id ?? null;
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [videoRef, stream, trackId]);
  return (
    <video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      aria-hidden
      data-testid="pip-video"
      className="pointer-events-none fixed bottom-0 left-0 -z-10 size-px opacity-0"
    />
  );
}
