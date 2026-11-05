"use client";

import { Download, ExternalLink, FileText, Link2, Type, Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { youtubeId } from "@/lib/validation/topic-content";
import type { TopicBlockDto } from "@/server/services/settings/topic-content.service";

export const BLOCK_ICON = { TEXT: Type, VIDEO: Video, FILE: FileText, LINK: Link2 } as const;

/** One block of a topic's lesson content as a student reads it (A-157). */
export function TopicBlockView({ block }: { block: TopicBlockDto }) {
  const t = useTranslations("portal.course");
  const Icon = BLOCK_ICON[block.kind];
  const video = block.kind === "VIDEO" ? youtubeId(block.url) : null;
  return (
    <section className="space-y-2" data-testid="topic-block" data-kind={block.kind}>
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{block.title}</span>
        {block.kind === "FILE" && block.url && (
          <a
            href={block.url}
            download=""
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-normal underline"
          >
            <Download className="size-3" /> {t("download")}
          </a>
        )}
        {block.kind === "LINK" && block.url && (
          <a
            href={block.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-normal underline"
          >
            <ExternalLink className="size-3" /> {t("open")}
          </a>
        )}
      </h4>
      {block.kind === "TEXT" && block.body && (
        <div className="space-y-2 text-sm leading-relaxed">
          {block.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      )}
      {block.kind === "VIDEO" &&
        (video ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video}`}
            title={block.title}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="aspect-video w-full rounded-md bg-black"
            data-testid="topic-youtube"
          />
        ) : block.url ? (
          <video
            controls
            preload="metadata"
            src={block.url}
            className="aspect-video w-full rounded-md bg-black"
            aria-label={block.title}
          />
        ) : null)}
      {block.kind === "LINK" && block.url && (
        <p className="truncate text-xs text-muted-foreground">{block.url}</p>
      )}
    </section>
  );
}
