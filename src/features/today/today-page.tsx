"use client";

import {
  BookOpenCheck,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  GraduationCap,
  HandCoins,
  Smartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/validation/groups";
import type { TrialStatus } from "@/lib/validation/leads";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { TodayDto, TodayLessonDto } from "@/server/services/today/today.service";

const CYCLE: AttendanceStatus[] = ["NOT_MARKED", "PRESENT", "ABSENT", "EXCUSED"];
const CHIP: Record<AttendanceStatus, string> = {
  NOT_MARKED: "border-border bg-card text-foreground",
  PRESENT: "border-success/40 bg-success/15 text-foreground",
  ABSENT: "border-destructive/40 bg-destructive/10 text-destructive",
  EXCUSED: "border-warning/50 bg-warning/20 text-foreground",
};
const MARK: Record<AttendanceStatus, string> = {
  NOT_MARKED: "·",
  PRESENT: "✓",
  ABSENT: "✕",
  EXCUSED: "±",
};

const shiftDay = (iso: string, days: number) => {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The teacher's day (A-113): one card per lesson with a tap-to-mark roster and
 * the homework, then the next lesson and the debtors of the user's groups.
 * Laid out for a phone first; the same page serves the office on a desktop.
 */
export function TodayPage({ data, userName }: { data: TodayDto; userName: string }) {
  const t = useTranslations("today");
  const fmt = useDateFormat();
  const isToday = data.date === data.today;
  const dateLabel = fmt(parseDateOnly(data.date), { dateStyle: "medium" });
  const weekday = fmt(parseDateOnly(data.date), { weekday: "long" });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isToday ? t("title") : dateLabel}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isToday
              ? t("subtitle", { name: userName, date: `${weekday}, ${dateLabel}` })
              : weekday}
          </p>
        </div>
        <div className="flex items-center gap-1" data-testid="today-nav">
          <Button variant="outline" size="icon" asChild>
            <Link
              href={`/today?date=${shiftDay(data.date, -1)}`}
              aria-label={t("prevDay")}
              data-testid="today-prev"
            >
              <ChevronLeft />
            </Link>
          </Button>
          {!isToday && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/today" data-testid="today-back">
                {t("backToToday")}
              </Link>
            </Button>
          )}
          <Button variant="outline" size="icon" asChild>
            <Link
              href={`/today?date=${shiftDay(data.date, 1)}`}
              aria-label={t("nextDay")}
              data-testid="today-next"
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </div>

      {data.lessons.length === 0 ? (
        <Card data-testid="today-empty">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarCheck className="size-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="font-medium">{t("lessons.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("lessons.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        data.lessons.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            canMark={data.canMark}
            canSeeBalances={data.canSeeBalances}
          />
        ))
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card data-testid="today-next-lesson">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-muted-foreground" /> {t("next.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.next ? (
              <div className="space-y-1">
                <p className="font-medium">
                  <Link href={`/groups/${data.next.groupId}`} className="hover:underline">
                    {data.next.groupName}
                  </Link>
                </p>
                <p className="text-muted-foreground">
                  {t("next.at", {
                    date:
                      data.next.date === data.today
                        ? t("todayWord")
                        : fmt(parseDateOnly(data.next.date), { dateStyle: "medium" }),
                    time: `${data.next.startTime}–${data.next.endTime}`,
                  })}
                  {data.next.roomName ? ` · ${data.next.roomName}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("next.none")}</p>
            )}
          </CardContent>
        </Card>

        {data.canSeeBalances && <DebtorsCard data={data} />}
      </div>

      <Card className="lg:hidden" data-testid="today-install">
        <CardContent className="flex items-start gap-3 py-4 text-sm">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="font-medium">{t("install.title")}</p>
            <p className="text-muted-foreground">{t("install.text")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DebtorsCard({ data }: { data: TodayDto }) {
  const t = useTranslations("today");
  const money = useMoneyFormat();
  return (
    <Card data-testid="today-debtors">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="size-4 text-muted-foreground" /> {t("debtors.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {data.debtorCount === 0 ? (
          <p className="text-muted-foreground">{t("debtors.none")}</p>
        ) : (
          <>
            <p className="mb-2 text-muted-foreground">
              {t("debtors.summary", { count: data.debtorCount, amount: money(data.debtTotal) })}
            </p>
            <ul className="divide-y">
              {data.debtors.map((d) => (
                <li
                  key={`${d.studentId}:${d.groupId}`}
                  className="flex items-center justify-between gap-3 py-1.5"
                  data-testid="today-debtor"
                >
                  <span className="min-w-0">
                    <Link href={`/students/${d.studentId}`} className="font-medium hover:underline">
                      {d.fullName}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {d.groupName}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-destructive">{money(d.amount)}</span>
                </li>
              ))}
            </ul>
            {data.debtorCount > data.debtors.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("debtors.more", { count: data.debtorCount - data.debtors.length })}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t("debtors.hint")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LessonCard({
  lesson,
  canMark,
  canSeeBalances,
}: {
  lesson: TodayLessonDto;
  canMark: boolean;
  canSeeBalances: boolean;
}) {
  const t = useTranslations("today");
  const tg = useTranslations("groups.attendance");
  const tTrial = useTranslations("leads.trial");
  const tRoot = useTranslations();
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(lesson.members.map((m) => [m.membershipId, m.attendance])),
  );
  const [trialMarks, setTrialMarks] = useState<Record<string, TrialStatus>>({});
  const [lastLesson, setLastLesson] = useState(lesson);
  if (lesson !== lastLesson) {
    setLastLesson(lesson);
    setMarks(Object.fromEntries(lesson.members.map((m) => [m.membershipId, m.attendance])));
    setTrialMarks({});
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [homeworkText, setHomeworkText] = useState("");
  const [homeworkDue, setHomeworkDue] = useState("");

  const total = lesson.members.length;
  const marked = Object.values(marks).filter((s) => s !== "NOT_MARKED").length;
  const present = Object.values(marks).filter((s) => s === "PRESENT").length;
  const refresh = () => startTransition(() => router.refresh());

  /** Takes the group's next syllabus topic for this lesson (A-137). */
  async function takeSuggested() {
    if (!canMark || !lesson.suggestedTopic) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/lessons/${lesson.id}`, {
        method: "PATCH",
        body: { courseTopicId: lesson.suggestedTopic.id },
      });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  async function send(next: Array<{ membershipId: string; status: AttendanceStatus }>) {
    if (!canMark || next.length === 0) return;
    const before = marks;
    setMarks({ ...marks, ...Object.fromEntries(next.map((n) => [n.membershipId, n.status])) });
    setError(null);
    setBusy(true);
    try {
      await api(`/lessons/${lesson.id}/attendance`, { method: "PUT", body: { marks: next } });
      refresh();
    } catch (e) {
      setMarks(before);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  // "Came" / "Didn't come" on a trial visitor (A-131); pressing the chosen one again clears it.
  async function markTrial(id: string, current: TrialStatus, chosen: "ATTENDED" | "NO_SHOW") {
    const next: TrialStatus = current === chosen ? "BOOKED" : chosen;
    const before = trialMarks;
    setTrialMarks({ ...trialMarks, [id]: next });
    setError(null);
    setBusy(true);
    try {
      await api(`/leads/trials/${id}`, { method: "PATCH", body: { status: next } });
      refresh();
    } catch (e) {
      setTrialMarks(before);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const cycle = (membershipId: string) => {
    const current = marks[membershipId] ?? "NOT_MARKED";
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    void send([{ membershipId, status: next }]);
  };
  const allPresent = () =>
    void send(
      lesson.members
        .filter((m) => (marks[m.membershipId] ?? "NOT_MARKED") === "NOT_MARKED")
        .map((m) => ({ membershipId: m.membershipId, status: "PRESENT" as const })),
    );

  async function saveHomework(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/lessons/${lesson.id}/homework`, {
        method: "PUT",
        body: { text: homeworkText, dueDate: homeworkDue || null, linkUrl: null },
      });
      setHomeworkOpen(false);
      setHomeworkText("");
      setHomeworkDue("");
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden" data-testid="today-lesson">
      <div className="h-1.5" style={{ backgroundColor: lesson.color ?? "var(--sidebar-active)" }} />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              <span className="tabular-nums">
                {lesson.startTime}–{lesson.endTime}
              </span>
              <Link
                href={`/groups/${lesson.groupId}`}
                className="hover:underline"
                data-testid="today-lesson-group"
              >
                {lesson.groupName}
              </Link>
              {lesson.isExtra && <Badge variant="secondary">{t("lesson.extra")}</Badge>}
            </CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>{lesson.courseName}</span>
              <span className="inline-flex items-center gap-1">
                <DoorOpen className="size-3.5" />
                {lesson.roomName ?? t("lesson.noRoom")}
              </span>
              {lesson.teacherNames.length > 0 && <span>{lesson.teacherNames.join(", ")}</span>}
            </p>
            {lesson.topic && <p className="mt-1 text-sm">{lesson.topic}</p>}
            {!lesson.topic && lesson.suggestedTopic && (
              <p
                className="mt-1 flex flex-wrap items-center gap-2 text-sm"
                data-testid="today-suggested-topic"
              >
                <span className="text-muted-foreground">
                  {t("lesson.suggested", { title: lesson.suggestedTopic.title })}
                </span>
                {canMark && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void takeSuggested()}
                    data-testid="today-use-topic"
                  >
                    {t("lesson.useTopic")}
                  </Button>
                )}
              </p>
            )}
          </div>
          {canMark && total > 0 && marked < total && (
            <Button size="sm" onClick={allPresent} disabled={busy} data-testid="today-all-present">
              {t("attendance.allPresent")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground" data-testid="today-attendance-summary">
            {total === 0
              ? t("attendance.noStudents")
              : t("attendance.summary", { marked, total, present })}
            {canMark && total > 0 ? ` · ${t("attendance.tap")}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {lesson.members.map((m) => {
              const status = marks[m.membershipId] ?? "NOT_MARKED";
              return (
                <button
                  key={m.membershipId}
                  type="button"
                  disabled={!canMark || busy}
                  onClick={() => cycle(m.membershipId)}
                  aria-label={`${m.fullName}: ${tg(status)}`}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    "disabled:cursor-default",
                    canMark && "active:scale-[0.98]",
                    CHIP[status],
                  )}
                  data-testid="today-member"
                  data-status={status}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.fullName}</span>
                    {m.comment && status !== "PRESENT" && (
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        data-testid="today-member-comment"
                      >
                        {m.comment}
                      </span>
                    )}
                    {canSeeBalances && m.balance !== null && m.balance < 0 && (
                      <span className="block text-xs text-destructive tabular-nums">
                        {money(m.balance)}
                      </span>
                    )}
                  </span>
                  <span className="text-lg leading-none" aria-hidden="true">
                    {MARK[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {lesson.trials.length > 0 && (
          <div className="rounded-md border border-dashed p-3 text-sm" data-testid="today-trials">
            <div className="flex items-center gap-2 font-medium">
              <GraduationCap className="size-4 text-muted-foreground" /> {t("trials.title")}
            </div>
            <ul className="mt-2 space-y-2">
              {lesson.trials.map((v) => {
                const status = trialMarks[v.id] ?? v.status;
                return (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                    data-testid="today-trial"
                    data-status={status}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{v.fullName}</span>
                      {(v.phone || v.note) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[v.phone, v.note].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                    {status === "CONVERTED" ? (
                      <Badge variant="success">{tTrial("statuses.CONVERTED")}</Badge>
                    ) : canMark ? (
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant={status === "ATTENDED" ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void markTrial(v.id, status, "ATTENDED")}
                          data-testid="today-trial-came"
                        >
                          {t("trials.came")}
                        </Button>
                        <Button
                          size="sm"
                          variant={status === "NO_SHOW" ? "destructive" : "outline"}
                          disabled={busy}
                          onClick={() => void markTrial(v.id, status, "NO_SHOW")}
                          data-testid="today-trial-no-show"
                        >
                          {t("trials.noShow")}
                        </Button>
                      </span>
                    ) : (
                      <Badge variant={status === "NO_SHOW" ? "destructive" : "outline"}>
                        {tTrial(`statuses.${status}`)}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
            {canMark && <p className="mt-2 text-xs text-muted-foreground">{t("trials.hint")}</p>}
          </div>
        )}

        <div className="rounded-md bg-muted/40 p-3 text-sm" data-testid="today-homework">
          <div className="flex items-center gap-2 font-medium">
            <BookOpenCheck className="size-4 text-muted-foreground" /> {t("homework.title")}
          </div>
          {lesson.homework ? (
            <div className="mt-1 space-y-1">
              <p className="whitespace-pre-wrap">{lesson.homework.text}</p>
              <p className="text-xs text-muted-foreground">
                {lesson.homework.dueDate &&
                  `${t("homework.due")}: ${fmt(parseDateOnly(lesson.homework.dueDate), { dateStyle: "medium" })} · `}
                {t("homework.submitted", { count: lesson.homework.submitted })}
                {lesson.homework.toCheck > 0 &&
                  ` · ${t("homework.toCheck", { count: lesson.homework.toCheck })}`}
                {" · "}
                <Link href={`/groups/${lesson.groupId}?tab=homework`} className="underline">
                  {t("homework.open")}
                </Link>
              </p>
            </div>
          ) : homeworkOpen ? (
            <form onSubmit={saveHomework} className="mt-2 space-y-3" noValidate>
              <div className="space-y-1">
                <Label htmlFor={`hw-text-${lesson.id}`}>{t("homework.text")}</Label>
                <Textarea
                  id={`hw-text-${lesson.id}`}
                  rows={3}
                  maxLength={4000}
                  value={homeworkText}
                  onChange={(e) => setHomeworkText(e.target.value)}
                  data-testid="today-homework-text"
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`hw-due-${lesson.id}`}>{t("homework.due")}</Label>
                  <Input
                    id={`hw-due-${lesson.id}`}
                    type="date"
                    value={homeworkDue}
                    onChange={(e) => setHomeworkDue(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !homeworkText.trim()}
                    data-testid="today-homework-save"
                  >
                    {t("homework.save")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setHomeworkOpen(false)}
                  >
                    {t("homework.cancel")}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground">{t("homework.none")}</p>
              {canMark && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHomeworkOpen(true)}
                  data-testid="today-homework-set"
                >
                  {t("homework.set")}
                </Button>
              )}
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {tRoot.has(error) ? tRoot(error) : error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
