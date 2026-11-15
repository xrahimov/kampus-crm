"use client";

import { ArrowRight, CalendarClock, Link2, ListChecks, UsersRound, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { TileWall } from "@/components/brand/tile-wall";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/validation/groups";
import type {
  DeskCheckingDto,
  DeskFocusDto,
  DeskLessonDto,
  DeskStudentDto,
} from "@/server/services/today/teaching-desk.service";
import type { GroupVideoDto, VideoRoomDto } from "@/server/services/video/video.service";

import { StudentLinksDialog } from "@/features/video/student-links-dialog";

const REFRESH_MS = 15_000;
const TICK_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The lesson's start on the centre's clock (Tashkent, UTC+5), as a moment. */
const momentOf = (date: string, time: string) => Date.parse(`${date}T${time}:00+05:00`);

const DOT: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success",
  ABSENT: "bg-destructive",
  EXCUSED: "bg-warning",
  NOT_MARKED: "bg-border",
};

/**
 * The top of a teacher's Today (A-194): the lesson under way or the next one,
 * drawn large on the sidebar's lapis, with the one button a teacher of an
 * online group comes for. The call's state is re-read while the page is open,
 * so "Start" turns into "Join" when a colleague or another tab opened it.
 */
export function LessonHero({
  focus,
  now,
  today,
  canHost,
  canSms,
}: {
  focus: DeskFocusDto;
  /** The server's clock when the page was drawn; the countdown starts from it. */
  now: string;
  today: string;
  canHost: boolean;
  canSms: boolean;
}) {
  const t = useTranslations("today.desk");
  const tv = useTranslations("video.card");
  const te = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const [video, setVideo] = useState<GroupVideoDto>(focus.video);
  const [nowMs, setNowMs] = useState(() => Date.parse(now));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const room = video.room;

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), TICK_MS);
    const refresh = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api<GroupVideoDto>(`/groups/${focus.groupId}/video`)
        .then(setVideo)
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [focus.groupId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const started = await api<VideoRoomDto>(`/groups/${focus.groupId}/video`, {
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

  const startsAt = momentOf(focus.date, focus.startTime);
  const endsAt = momentOf(focus.date, focus.endTime);
  const minutes = Math.max(0, Math.ceil((startsAt - nowMs) / 60_000));
  const underWay = nowMs >= startsAt && nowMs < endsAt;
  const tomorrow = momentOf(focus.date, "00:00") - momentOf(today, "00:00") === DAY_MS;
  const weekday = fmt(parseDateOnly(focus.date), { weekday: "long" });
  const when = room
    ? tv("live")
    : underWay
      ? t("underWay", { end: focus.endTime })
      : focus.date === today
        ? minutes < 60
          ? t("inMinutes", { minutes: Math.max(1, minutes) })
          : t("inHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
        : tomorrow
          ? t("tomorrow", { weekday })
          : t("onDay", {
              weekday,
              date: fmt(parseDateOnly(focus.date), { day: "numeric", month: "short" }),
            });
  const hidden = focus.studentCount - focus.studentNames.length;

  return (
    <section
      aria-label={t("heroLabel")}
      data-testid="today-next-lesson"
      data-live={room ? "true" : "false"}
      className="relative isolate animate-rise overflow-hidden rounded-xl bg-sidebar text-sidebar-foreground shadow-lift dark:ring-1 dark:ring-white/10"
    >
      <TileWall
        id="desk-wall"
        quiet
        className="-z-10 [mask-image:linear-gradient(to_left,black,transparent_62%)]"
      />
      <div className="flex flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium" data-testid="desk-when">
            {(room || underWay) && (
              <span className="relative flex size-2.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sidebar-active opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2.5 rounded-full bg-sidebar-active" />
              </span>
            )}
            <span className={room || underWay ? "text-sidebar-active" : undefined}>{when}</span>
          </p>
          <p className="mt-2 text-[2.75rem] leading-none font-semibold tracking-tight text-white sm:text-6xl">
            {focus.startTime}
            <span className="text-2xl font-medium text-sidebar-foreground sm:text-3xl">
              {" "}
              – {focus.endTime}
            </span>
          </p>
          <p className="mt-3 text-lg leading-snug font-medium text-white">
            <Link
              href={`/groups/${focus.groupId}`}
              className="rounded-sm hover:underline focus-visible:outline-sidebar-active"
              data-testid="desk-group"
            >
              {focus.groupName}
            </Link>
            <span className="ml-2 text-base font-normal text-sidebar-foreground">
              {focus.courseName}
            </span>
          </p>
          <p className="mt-1 text-sm">
            {focus.studentCount === 0
              ? t("noStudents")
              : hidden > 0
                ? t("namesAndMore", { names: focus.studentNames.join(", "), count: hidden })
                : focus.studentNames.join(", ")}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 md:items-end">
          {video.enabled && room ? (
            <Button
              asChild
              size="lg"
              className="h-12 bg-sidebar-active px-6 text-base text-sidebar hover:bg-sidebar-active/90"
              data-testid="desk-video-join"
            >
              <Link href={`/video/${room.id}`}>
                <Video /> {t("join")}
              </Link>
            </Button>
          ) : video.enabled && canHost ? (
            <Button
              size="lg"
              onClick={start}
              disabled={busy}
              className="h-12 bg-sidebar-active px-6 text-base text-sidebar hover:bg-sidebar-active/90"
              data-testid="desk-video-start"
            >
              <Video /> {busy ? tv("starting") : tv("start")}
            </Button>
          ) : null}
          <div className="flex flex-wrap gap-1 md:justify-end">
            {video.enabled && canHost && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLinksOpen(true)}
                className="text-sidebar-foreground hover:bg-sidebar-muted hover:text-white"
                data-testid="desk-links"
              >
                <Link2 /> {tv("links")}
              </Button>
            )}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground hover:bg-sidebar-muted hover:text-white"
            >
              <Link href={`/groups/${focus.groupId}`}>
                {t("openGroup")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {!video.enabled && (
        <p className="border-t border-white/10 px-5 py-2.5 text-sm sm:px-7">{tv("disabled")}</p>
      )}
      {error && (
        <div className="px-5 pb-5 sm:px-7">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}
      {canHost && (
        <StudentLinksDialog
          groupId={focus.groupId}
          open={linksOpen}
          onOpenChange={setLinksOpen}
          canSms={canSms}
        />
      )}
    </section>
  );
}

/** Nothing to teach yet: says why, and what to do about it. */
export function DeskEmpty({
  groupCount,
  fullViewName,
}: {
  groupCount: number;
  /** The other side of the switch, when the person has one: they can fix it themselves. */
  fullViewName: string | null;
}) {
  const t = useTranslations("today.desk");
  return (
    <Card data-testid="desk-empty">
      <CardContent className="flex items-start gap-3 py-6">
        <CalendarClock className="mt-0.5 size-6 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <div className="space-y-1 text-sm">
          <p className="text-base font-medium">
            {groupCount === 0 ? t("noGroupsTitle") : t("noLessonsTitle")}
          </p>
          <p className="text-muted-foreground">
            {groupCount > 0
              ? t("noLessonsText")
              : fullViewName
                ? t("noGroupsSwitch", { role: fullViewName })
                : t("noGroupsAsk")}
          </p>
          {groupCount > 0 && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/groups">{t("openGroups")}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Homework answers waiting for a verdict: a few names and the way to the queue. */
export function DeskChecking({ checking }: { checking: DeskCheckingDto }) {
  const t = useTranslations("today.desk");
  const fmt = useDateFormat();
  return (
    <Card data-testid="desk-checking">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" /> {t("checkingTitle")}
        </CardTitle>
        {checking.total > 0 && (
          <span
            className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground tabular-nums"
            data-testid="desk-checking-count"
          >
            {checking.total}
          </span>
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {checking.total === 0 ? (
          <p className="text-muted-foreground">{t("checkingNone")}</p>
        ) : (
          <>
            <ul className="divide-y">
              {checking.items.map((item) => (
                <li key={item.key} className="py-2 first:pt-0">
                  <p className="truncate font-medium">{item.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      item.what ??
                        (item.lessonDate
                          ? fmt(parseDateOnly(item.lessonDate), { dateStyle: "medium" })
                          : null),
                      item.groupName,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </li>
              ))}
            </ul>
            {checking.total > checking.items.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("checkingMore", { count: checking.total - checking.items.length })}
              </p>
            )}
            <Button asChild size="sm" className="mt-3" data-testid="desk-checking-open">
              <Link href="/checking">{t("checkingOpen")}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The lessons after the one on top, a line each. */
export function DeskComingUp({ lessons, today }: { lessons: DeskLessonDto[]; today: string }) {
  const t = useTranslations("today.desk");
  const tt = useTranslations("today");
  const fmt = useDateFormat();
  if (lessons.length === 0) return null;
  return (
    <Card data-testid="desk-coming-up">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-muted-foreground" /> {t("comingUp")}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <ul className="divide-y">
          {lessons.map((l) => (
            <li key={l.id} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
              <span className="w-24 shrink-0 text-muted-foreground">
                {l.date === today
                  ? tt("todayWord")
                  : `${fmt(parseDateOnly(l.date), { weekday: "short" })}, ${fmt(parseDateOnly(l.date), { day: "numeric", month: "short" })}`}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{l.startTime}</span>
              <Link href={`/groups/${l.groupId}`} className="min-w-0 truncate hover:underline">
                {l.groupName}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The teacher's own students with their last few lessons as dots. */
export function DeskStudents({ students, total }: { students: DeskStudentDto[]; total: number }) {
  const t = useTranslations("today.desk");
  const tg = useTranslations("groups.attendance");
  if (total === 0) return null;
  return (
    <Card data-testid="desk-students">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="size-4 text-muted-foreground" /> {t("students")}
        </CardTitle>
        <span className="text-xs text-muted-foreground">{t("lastLessons")}</span>
      </CardHeader>
      <CardContent className="text-sm">
        <ul className="divide-y">
          {students.map((s) => (
            <li
              key={s.membershipId}
              className="flex items-center justify-between gap-3 py-2 first:pt-0"
              data-testid="desk-student"
            >
              <span className="min-w-0">
                <Link
                  href={`/students/${s.studentId}`}
                  className="block truncate font-medium hover:underline"
                >
                  {s.fullName}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">{s.groupName}</span>
              </span>
              {s.marks.length === 0 ? (
                <span className="shrink-0 text-xs text-muted-foreground">{t("noMarks")}</span>
              ) : (
                <span
                  className="flex shrink-0 items-center gap-1"
                  role="img"
                  aria-label={s.marks.map((m) => tg(m)).join(", ")}
                >
                  {s.marks.map((m, i) => (
                    <span
                      key={i}
                      title={tg(m)}
                      className={cn("size-2.5 rounded-full", DOT[m])}
                      data-status={m}
                    />
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
        {total > students.length && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href="/students">{t("allStudents", { count: total })}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
