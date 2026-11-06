"use client";

import { Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { groupByLesson, KIND_ICON } from "@/features/materials/group-materials-tab";
import { VideoPlayer } from "@/features/shared/video-player";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { MaterialDto } from "@/server/services/materials/materials.service";

/** The group's files, links and lesson recordings on the student's page (A-105). */
export function PortalMaterialsTab({ items, token }: { items: MaterialDto[]; token: string }) {
  const t = useTranslations("portal.materials");
  const fmt = useDateFormat();
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });
  // Where the student is in a recording goes to the server (A-175): the next device continues there.
  const saveProgress = (materialId: string, positionSec: number, durationSec: number | null) => {
    void fetch(
      `/api/v1/public/class/${encodeURIComponent(token)}/materials/${materialId}/progress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSec, durationSec }),
        keepalive: true,
      },
    ).catch(() => undefined);
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <div className="space-y-4" data-testid="portal-materials">
      {groupByLesson(items).map((g) => (
        <section key={g.key}>
          <h3 className="mb-2 text-sm font-medium">
            {g.lessonDate ? t("lessonOf", { date: date(g.lessonDate) }) : t("general")}
            {g.lessonTopic && (
              <span className="ml-2 font-normal text-muted-foreground">{g.lessonTopic}</span>
            )}
          </h3>
          <ul className="divide-y rounded-lg border text-sm">
            {g.items.map((m) => {
              const Icon = KIND_ICON[m.kind];
              return (
                <li key={m.id} className="space-y-2 px-3 py-2" data-testid="portal-material">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                    {m.durationSec ? (
                      <span className="text-xs text-muted-foreground">
                        {t("duration", { minutes: Math.max(1, Math.round(m.durationSec / 60)) })}
                      </span>
                    ) : null}
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs underline"
                      {...(m.kind === "FILE" ? { download: "" } : {})}
                    >
                      {m.kind === "LINK" ? (
                        <ExternalLink className="size-3" />
                      ) : (
                        <Download className="size-3" />
                      )}
                      {m.kind === "LINK" ? t("open") : t("download")}
                    </a>
                  </div>
                  {m.kind === "RECORDING" && (
                    <VideoPlayer
                      src={m.url}
                      hlsSrc={m.hlsUrl}
                      title={t("recording")}
                      resumeSec={m.resumeSec}
                      storageKey={m.id}
                      onProgress={(pos, dur) => saveProgress(m.id, pos, dur)}
                      testId="portal-recording"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
