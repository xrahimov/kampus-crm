"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  Music,
  PenLine,
  Play,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  annotationLayer,
  canAnnotate,
  expectedPosition,
  needsSeek,
  youtubeId,
} from "@/lib/video-material";
import type { ShownMaterialDto } from "@/server/services/video/video.service";

import type { CallEngine } from "./call-engine";
import { PdfPage } from "./pdf-page";
import { BoardCanvas, BoardToolbar, useBoardTools } from "./whiteboard";

/** Each viewer enlarges a page for themselves: fit, then these, then back to fit. */
const ZOOM_STEPS = [1, 1.75, 2.5];

/** How often a follower checks that its player is still in step with the teacher's. */
const FOLLOW_CHECK_MS = 4000;

/**
 * A lesson material on everyone's stage (A-183). The teacher turns the pages of
 * a PDF and plays, pauses and jumps in a video or audio file; every browser
 * follows. A picture or a page can be drawn on with the whiteboard's pen. What
 * a browser cannot display (other links, office files) is a card with a button.
 */
export function MaterialStage({
  engine,
  material,
}: {
  engine: CallEngine;
  material: ShownMaterialDto;
}) {
  const t = useTranslations("video.material");
  const isHost = engine.self.role === "HOST";
  const [pages, setPages] = useState<number | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  const [tools, setTools] = useBoardTools();
  // Small print on a phone: everyone zooms for themselves and drags the page around.
  const [zoomStep, setZoomStep] = useState(0);
  const zoom = ZOOM_STEPS[zoomStep] ?? 1;
  const lastZoom = zoomStep >= ZOOM_STEPS.length - 1;
  const view = failed ? "file" : material.view;
  const drawable = canAnnotate(view);
  const drawing = drawable && engine.currentStage.board;
  const layer = annotationLayer(material.id, material.page);
  const lastPage = pages ?? material.page;

  // The teacher turns pages with the arrow keys too.
  useEffect(() => {
    if (!isHost || view !== "pdf") return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (material.page < lastPage) engine.turnMaterialPage(material.page + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        engine.turnMaterialPage(material.page - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine, isHost, view, material.page, lastPage]);

  const setSurface = (el: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | null) =>
    engine.setStageSurface(el);

  const button =
    "grid size-9 shrink-0 place-items-center rounded-md hover:bg-sidebar focus-visible:outline-2 focus-visible:outline-sidebar-active disabled:opacity-40 pointer-coarse:size-11";

  return (
    <div
      className="flex size-full flex-col overflow-hidden rounded-lg bg-sidebar-muted"
      data-testid="material-stage"
      data-view={view}
    >
      <div className="flex flex-wrap items-center justify-end gap-1 px-2 py-1.5 text-sm text-white short:py-0.5">
        <span className="min-w-24 flex-1 truncate px-1 font-medium" data-testid="material-title">
          {material.title}
        </span>
        {view === "pdf" && (
          <span className="flex shrink-0 items-center gap-0.5">
            {isHost && (
              <button
                type="button"
                onClick={() => engine.turnMaterialPage(material.page - 1)}
                disabled={material.page <= 1}
                aria-label={t("prevPage")}
                title={t("prevPage")}
                className={button}
                data-testid="material-prev"
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <span className="px-1 text-xs tabular-nums" data-testid="material-page">
              {pages
                ? t("pageOf", { page: Math.min(material.page, pages), pages })
                : t("page", { page: material.page })}
            </span>
            {isHost && (
              <button
                type="button"
                onClick={() => engine.turnMaterialPage(material.page + 1)}
                disabled={pages === null || material.page >= pages}
                aria-label={t("nextPage")}
                title={t("nextPage")}
                className={button}
                data-testid="material-next"
              >
                <ChevronRight className="size-5" />
              </button>
            )}
          </span>
        )}
        {isHost && drawable && (
          <button
            type="button"
            onClick={() => engine.setStage({ board: !drawing })}
            aria-pressed={drawing}
            aria-label={drawing ? t("penOff") : t("pen")}
            title={drawing ? t("penOff") : t("pen")}
            className={cn(button, drawing && "bg-white text-sidebar hover:bg-white/90")}
            data-testid="material-pen"
          >
            <PenLine className="size-4" />
          </button>
        )}
        {drawable && (
          <button
            type="button"
            onClick={() => setZoomStep(lastZoom ? 0 : zoomStep + 1)}
            aria-label={lastZoom ? t("zoomFit") : t("zoomIn")}
            title={lastZoom ? t("zoomFit") : t("zoomIn")}
            className={button}
            data-testid="material-zoom"
            data-zoom={zoom}
          >
            {lastZoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
          </button>
        )}
        <a
          href={material.url}
          target="_blank"
          rel="noreferrer"
          aria-label={t("open")}
          title={t("open")}
          className={button}
          data-testid="material-open"
        >
          <ExternalLink className="size-4" />
        </a>
        {isHost && (
          <button
            type="button"
            onClick={() => engine.hideMaterial()}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-xs font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-sidebar-active pointer-coarse:h-11"
            data-testid="material-stop"
          >
            <X className="size-4" />
            <span className="hidden sm:inline">{t("stop")}</span>
          </button>
        )}
      </div>

      {/* Over a page the bar is for those who draw; the others just see the marks. */}
      {drawing && engine.canDraw && (
        <BoardToolbar
          engine={engine}
          layer={layer}
          tools={tools}
          onTools={setTools}
          className="border-b-0"
        />
      )}

      {view === "pdf" || view === "image" ? (
        <FitBox aspect={aspect} zoom={zoom}>
          {view === "pdf" ? (
            <PdfPage
              url={material.url}
              page={material.page}
              onInfo={(info) => {
                setPages(info.pages);
                setAspect(info.aspect);
              }}
              onError={() => setFailed(true)}
              onSurface={setSurface}
            />
          ) : (
            // A stored file of unknown size: the optimised image component does not apply.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={material.url}
              alt={material.title}
              ref={setSurface}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  setAspect(img.naturalWidth / img.naturalHeight);
                }
              }}
              onError={() => setFailed(true)}
              className="absolute inset-0 size-full bg-white object-contain"
              data-testid="material-image"
            />
          )}
          {drawing && <BoardCanvas engine={engine} layer={layer} tools={tools} transparent />}
        </FitBox>
      ) : view === "video" || view === "audio" ? (
        <MediaView engine={engine} material={material} audio={view === "audio"} />
      ) : view === "youtube" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId(material.url) ?? ""}?playsinline=1&rel=0`}
            title={material.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="min-h-0 w-full flex-1 rounded-md bg-black"
            data-testid="material-youtube"
          />
          <p className="text-center text-xs opacity-80">{t("youtubeHint")}</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center p-4">
          <div className="max-w-md space-y-3 text-center" data-testid="material-card">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-sidebar text-white">
              {material.kind === "LINK" ? (
                <Link2 className="size-6" />
              ) : (
                <FileText className="size-6" />
              )}
            </span>
            <p className="text-base font-medium break-words text-white">{material.title}</p>
            <p className="text-sm">
              {failed ? t("failed") : material.kind === "LINK" ? t("linkText") : t("fileText")}
            </p>
            {isHost && !failed && material.kind !== "LINK" && (
              <p className="text-xs opacity-80">{t("fileHostHint")}</p>
            )}
            <a
              href={material.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-sidebar hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-active"
              data-testid="material-card-open"
            >
              <ExternalLink className="size-4" /> {t("open")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Holds one page at its own shape, as large as the space allows, or larger
 * when the viewer zoomed in (then the space scrolls). The pen's marks are kept
 * in 0-1 coordinates of this box, so they land on the same spot of the page on
 * a phone and on a large screen.
 */
function FitBox({
  aspect,
  zoom,
  children,
}: {
  aspect: number;
  zoom: number;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    // The observer reports the size once at the start and then on every change.
    const observer = new ResizeObserver(() => {
      const width = Math.floor(Math.min(el.clientWidth, el.clientHeight * aspect));
      if (width > 0) setFit({ width, height: Math.floor(width / aspect) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect]);
  return (
    <div className="min-h-0 flex-1 p-2 pt-0">
      {/* Measured without the padding. `m-auto` centres a page that fits and lets a zoomed one scroll from its edge. */}
      <div ref={outer} className="flex size-full overflow-auto overscroll-contain">
        <div
          className="relative m-auto shrink-0 overflow-hidden rounded-md bg-white"
          style={
            fit
              ? { width: Math.round(fit.width * zoom), height: Math.round(fit.height * zoom) }
              : { width: "100%", height: "100%" }
          }
          data-testid="material-page-box"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A video or audio file played in step (A-183). The teacher's player has the
 * browser's own controls, and each play, pause and jump goes to everyone.
 * Followers have no controls: their player goes where the teacher's is.
 */
function MediaView({
  engine,
  material,
  audio,
}: {
  engine: CallEngine;
  material: ShownMaterialDto;
  audio: boolean;
}) {
  const t = useTranslations("video.material");
  const isHost = engine.self.role === "HOST";
  const ref = useRef<HTMLVideoElement>(null);
  // The browser refused to start the sound by itself: the viewer taps once.
  const [blocked, setBlocked] = useState(false);
  const { playing, position, at } = material;

  // The teacher's player after a reload, and every follower's: go where the lesson is.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const follow = () => {
      if (el.readyState < 1) return;
      const expected = expectedPosition({ playing, position, at }, engine.serverNow());
      const target = Number.isFinite(el.duration) ? Math.min(expected, el.duration) : expected;
      if (needsSeek(el.currentTime, target)) el.currentTime = target;
      if (playing && el.paused && !el.ended) {
        el.play().then(
          () => setBlocked(false),
          () => {
            if (isHost) engine.setMaterialPlayback(false, el.currentTime);
            else setBlocked(true);
          },
        );
      } else if (!playing && !el.paused) {
        el.pause();
      }
    };
    if (isHost) {
      // The teacher's player leads; it only catches up once, when it opens.
      if (el.readyState >= 1) return;
      el.addEventListener("loadedmetadata", follow, { once: true });
      return () => el.removeEventListener("loadedmetadata", follow);
    }
    follow();
    el.addEventListener("loadedmetadata", follow);
    const timer = setInterval(follow, FOLLOW_CHECK_MS);
    return () => {
      el.removeEventListener("loadedmetadata", follow);
      clearInterval(timer);
    };
  }, [engine, isHost, playing, position, at]);

  useEffect(() => {
    if (audio) return;
    engine.setStageSurface(ref.current);
    return () => engine.setStageSurface(null);
  }, [engine, audio]);

  const lead = isHost
    ? {
        onPlay: (e: React.SyntheticEvent<HTMLVideoElement>) =>
          engine.setMaterialPlayback(true, e.currentTarget.currentTime),
        onPause: (e: React.SyntheticEvent<HTMLVideoElement>) =>
          engine.setMaterialPlayback(false, e.currentTarget.currentTime),
        onSeeked: (e: React.SyntheticEvent<HTMLVideoElement>) =>
          engine.setMaterialPlayback(!e.currentTarget.paused, e.currentTarget.currentTime),
      }
    : {};

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-2 pt-0">
      {audio && (
        <span
          className={cn(
            "grid size-20 place-items-center rounded-full bg-sidebar text-white",
            playing && "animate-pulse motion-reduce:animate-none",
          )}
          aria-hidden
        >
          <Music className="size-8" />
        </span>
      )}
      {/* A video element plays audio files too; one kind of player keeps the two in step alike. */}
      <video
        ref={ref}
        src={material.url}
        controls={isHost}
        playsInline
        preload="auto"
        {...lead}
        className={cn(
          audio
            ? isHost
              ? "h-14 w-full max-w-xl"
              : "hidden"
            : "min-h-0 w-full flex-1 rounded-md bg-black object-contain",
        )}
        data-testid="material-media"
      />
      <p
        className="text-center text-xs opacity-80"
        role="status"
        data-testid="material-media-status"
      >
        {isHost ? t("hostPlayHint") : playing ? t("followPlaying") : t("followPaused")}
      </p>
      {blocked && !isHost && (
        <button
          type="button"
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.play().then(
              () => setBlocked(false),
              () => undefined,
            );
          }}
          className="absolute inset-0 m-auto inline-flex h-12 w-fit items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-sidebar shadow-lg hover:bg-white/90"
          data-testid="material-tap-to-play"
        >
          <Play className="size-4" /> {t("tapToPlay")}
        </button>
      )}
    </div>
  );
}
