"use client";

import { Play } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A how-to video of the manual (A-199). Nothing is fetched until the reader
 * presses play: the card stands in for the video's opening picture, so a page
 * with several videos costs nothing to open. `compact` is one line that opens
 * into the player, for the sign-in pages.
 */
export function HelpVideo({
  src,
  title,
  note,
  label,
  compact = false,
  className,
}: {
  src: string;
  title: string;
  note?: string;
  /** "Video" in the reader's language; read out and shown with the title. */
  label: string;
  compact?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const player = (
    <video
      src={src}
      controls
      autoPlay
      playsInline
      className="block aspect-video w-full bg-black"
      data-testid="help-video-player"
    />
  );

  if (compact) {
    return (
      <div
        className={cn("overflow-hidden rounded-lg border bg-card text-sm", className)}
        data-testid="help-video"
      >
        {playing ? (
          player
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60"
            data-testid="help-video-play"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar text-sidebar-active">
              <Play className="size-4 fill-current" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{label}</span>
              <span className="block font-medium group-hover:text-primary">{title}</span>
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <figure
      className={cn("my-4 overflow-hidden rounded-lg border bg-card shadow-sm", className)}
      data-testid="help-video"
    >
      {playing ? (
        player
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group flex aspect-video w-full flex-col items-center justify-center gap-3 bg-sidebar px-6 text-center text-white"
          data-testid="help-video-play"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 transition-colors group-hover:bg-white/25">
            <Play className="size-6 translate-x-0.5 fill-current" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight sm:text-2xl">{title}</span>
          {note && (
            <span className="max-w-lg text-sm text-sidebar-foreground max-sm:hidden">{note}</span>
          )}
        </button>
      )}
      <figcaption className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {label}: {title}
      </figcaption>
    </figure>
  );
}
