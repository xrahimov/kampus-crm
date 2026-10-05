"use client";

import { Link2, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { APP_TIME_ZONE } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { GroupVideoDto, VideoRoomDto } from "@/server/services/video/video.service";

import { StudentLinksDialog } from "./student-links-dialog";

const REFRESH_MS = 15_000;
/** "14:05" in the centre's zone; digits only, so it needs no locale data. */
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: APP_TIME_ZONE,
});

/** The group page's video lesson card: start, join or end the call, and the students' links. */
export function GroupVideoCard({
  groupId,
  initial,
  canHost,
  canSms,
}: {
  groupId: string;
  initial: GroupVideoDto;
  /** May start and end calls and see students' links (same right as marking attendance). */
  canHost: boolean;
  canSms: boolean;
}) {
  const t = useTranslations("video.card");
  const te = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "links" | "end">(null);
  const room = state.room;

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api<GroupVideoDto>(`/groups/${groupId}/video`)
        .then(setState)
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [groupId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const started = await api<VideoRoomDto>(`/groups/${groupId}/video`, {
        method: "POST",
        body: {},
      });
      router.push(`/video/${started.id}`);
    } catch (e) {
      const key = e instanceof ApiError ? e.message : "errors.internal";
      setError(te.has(key) ? te(key) : te("errors.internal"));
      setBusy(false);
    }
  }

  const time = (iso: string) => CLOCK.format(new Date(iso));
  const day = (iso: string) => fmt(new Date(iso), { dateStyle: "medium" });

  return (
    <Card data-testid="group-video">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="size-4 text-muted-foreground" aria-hidden /> {t("title")}
        </CardTitle>
        {room && (
          <span
            className="flex items-center gap-1.5 text-sm font-medium text-accent-foreground"
            data-testid="video-live"
          >
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ring opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ring" />
            </span>
            {t("live")}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!state.enabled ? (
          <p className="text-muted-foreground">{t("disabled")}</p>
        ) : room ? (
          <>
            <p>
              {t("liveSince", { name: room.startedByName, time: time(room.startedAt) })}{" "}
              <span className="text-muted-foreground">
                {t("online", { count: room.online.length })}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" data-testid="video-join">
                <Link href={`/video/${room.id}`}>{t("join")}</Link>
              </Button>
              {canHost && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog("end")}
                  data-testid="video-end"
                >
                  {t("end")}
                </Button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              {state.todayLesson
                ? t("today", {
                    start: state.todayLesson.startTime,
                    end: state.todayLesson.endTime,
                  })
                : t("noLessonToday")}
            </p>
            {canHost && (
              <Button size="sm" onClick={start} disabled={busy} data-testid="video-start">
                <Video /> {busy ? t("starting") : t("start")}
              </Button>
            )}
          </>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        {canHost && state.enabled && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => setDialog("links")}
            data-testid="video-links"
          >
            <Link2 /> {t("links")}
          </Button>
        )}
        {state.lastRoom && (
          <details className="border-t pt-3" data-testid="video-last">
            <summary className="cursor-pointer text-muted-foreground">
              {t("last", {
                date: day(state.lastRoom.startedAt),
                count: state.lastRoom.students.length,
              })}
            </summary>
            {state.lastRoom.students.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {state.lastRoom.students.map((s) => (
                  <li key={s.studentId} className="flex justify-between gap-2">
                    <Link href={`/students/${s.studentId}`} className="truncate hover:underline">
                      {s.fullName}
                    </Link>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {t("minutes", { count: s.minutes })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        )}
      </CardContent>

      {canHost && (
        <StudentLinksDialog
          groupId={groupId}
          open={dialog === "links"}
          onOpenChange={(open) => setDialog(open ? "links" : null)}
          canSms={canSms}
        />
      )}
      {room && canHost && (
        <ConfirmDialog
          open={dialog === "end"}
          onOpenChange={(open) => setDialog(open ? "end" : null)}
          title={te("video.room.endTitle")}
          description={te("video.room.endText")}
          confirmLabel={te("video.room.endForAll")}
          onConfirm={async () => {
            await api(`/video/rooms/${room.id}/end`, { method: "POST" });
            setState(await api<GroupVideoDto>(`/groups/${groupId}/video`));
          }}
        />
      )}
    </Card>
  );
}
