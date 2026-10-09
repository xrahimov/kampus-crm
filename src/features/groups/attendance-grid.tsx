"use client";

import { Paperclip, Plus, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/validation/groups";
import { useDateFormat } from "@/lib/use-date-format";
import type { MonthGridDto } from "@/server/services/groups/lessons.service";

import { ExcelLink } from "@/features/shared/excel-link";

import { MonthTabs } from "./month-tabs";

const CYCLE: AttendanceStatus[] = ["NOT_MARKED", "PRESENT", "ABSENT", "EXCUSED"];
const CELL: Record<AttendanceStatus, string> = {
  NOT_MARKED: "bg-muted/40 text-muted-foreground",
  PRESENT: "bg-success/20 text-foreground",
  ABSENT: "bg-destructive/15 text-destructive",
  EXCUSED: "bg-warning/20 text-foreground",
};
const MARK: Record<AttendanceStatus, string> = {
  NOT_MARKED: "·",
  PRESENT: "✓",
  ABSENT: "✕",
  EXCUSED: "±",
};

/** EXP §5 DAVOMAT: month tabs, students × lesson dates, a click cycles the mark. */
export function AttendanceGrid({
  groupId,
  months,
  grid,
  canMark,
  canEdit,
}: {
  groupId: string;
  months: string[];
  grid: MonthGridDto;
  canMark: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [topicLesson, setTopicLesson] = useState<MonthGridDto["lessons"][number] | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const day = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });
  const changeLine = (c: MonthGridDto["changes"][number]) =>
    c.scope === "BRANCH"
      ? t("groups.attendance.holiday", { date: day(c.date), reason: c.reason })
      : c.movedTo
        ? t("groups.attendance.moved", {
            date: day(c.date),
            newDate: day(c.movedTo.date),
            start: c.movedTo.startTime,
            end: c.movedTo.endTime,
            reason: c.reason,
          })
        : t("groups.attendance.cancelled", { date: day(c.date), reason: c.reason });

  /** Undoes a day off (A-117): the planned lesson comes back. */
  async function undo(dayOffId: string) {
    setError(null);
    try {
      await api(`/groups/${groupId}/day-off/${dayOffId}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  async function cycle(lessonId: string, membershipId: string, current: AttendanceStatus) {
    if (!canMark) return;
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]!;
    setError(null);
    try {
      await api(`/lessons/${lessonId}/attendance`, {
        method: "PUT",
        body: { marks: [{ membershipId, status: next }] },
      });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthTabs months={months} current={grid.month} />
        <div className="flex flex-wrap gap-2">
          <ExcelLink
            path={`/groups/${groupId}/attendance.xlsx`}
            params={{ month: grid.month }}
            testId="attendance-excel"
          />
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExtraOpen(true)}
              data-testid="extra-lesson"
            >
              <Plus /> {t("groups.attendance.extraLesson")}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.has(error) ? t(error) : t("errors.internal")}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {CYCLE.map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={cn("inline-flex size-5 items-center justify-center rounded", CELL[s])}>
              {MARK[s]}
            </span>
            {t(`groups.attendance.${s}`)}
          </span>
        ))}
      </div>
      {grid.changes.length > 0 && (
        <ul
          className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm"
          data-testid="lesson-changes"
        >
          <li className="text-xs font-medium text-muted-foreground">
            {t("groups.attendance.changes")}
          </li>
          {grid.changes.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2"
              data-testid="lesson-change"
            >
              <span>{changeLine(c)}</span>
              {canEdit && c.scope === "GROUP" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => undo(c.id)}
                  data-testid="lesson-change-undo"
                >
                  <Undo2 /> {t("groups.attendance.undo")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {grid.lessons.length === 0 ? (
        <EmptyState title={t("groups.attendance.noLessons")} />
      ) : grid.members.length === 0 ? (
        <EmptyState title={t("groups.members.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-testid="attendance-grid">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left font-medium">
                  {t("groups.members.student")}
                </th>
                {grid.lessons.map((l) => (
                  <th key={l.id} className="px-1 py-2 text-center font-medium whitespace-nowrap">
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-secondary disabled:cursor-default"
                      disabled={!canMark}
                      onClick={() => setTopicLesson(l)}
                      title={[
                        l.movedFrom
                          ? t("groups.attendance.movedFrom", { date: day(l.movedFrom) })
                          : null,
                        l.topic ?? t("groups.attendance.setTopic"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      {fmt(parseDateOnly(l.date), { day: "numeric", month: "short" })}
                      {l.isExtra && <span className="ml-0.5 text-[10px] text-primary">+</span>}
                      {l.movedFrom && (
                        <span
                          className="ml-0.5 text-[10px] text-muted-foreground"
                          data-testid="lesson-moved-from"
                        >
                          ↩
                        </span>
                      )}
                      {l.attachmentUrl && <Paperclip className="ml-0.5 inline size-3" />}
                    </button>
                  </th>
                ))}
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="sticky left-0 bg-card px-3 py-1 text-left font-normal">
                  {t("groups.attendance.topics")}
                </th>
                {grid.lessons.map((l) => (
                  <th
                    key={l.id}
                    className="max-w-24 truncate px-1 py-1 font-normal"
                    title={l.topic ?? ""}
                  >
                    {l.topic ?? "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.members.map((m) => (
                <tr
                  key={m.membershipId}
                  className="border-b last:border-0"
                  data-testid="attendance-row"
                >
                  <td className="sticky left-0 bg-card px-3 py-1.5 whitespace-nowrap">
                    {m.fullName}
                  </td>
                  {grid.lessons.map((l) => {
                    const status = l.attendance[m.membershipId]?.status ?? "NOT_MARKED";
                    return (
                      <td key={l.id} className="px-1 py-1 text-center">
                        <button
                          type="button"
                          disabled={!canMark}
                          onClick={() => cycle(l.id, m.membershipId, status)}
                          aria-label={`${m.fullName} ${l.date}: ${t(`groups.attendance.${status}`)}`}
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded text-sm font-semibold transition-colors",
                            CELL[status],
                            canMark && "hover:ring-2 hover:ring-ring/40",
                          )}
                        >
                          {MARK[status]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ExtraLessonDialog
        groupId={groupId}
        open={extraOpen}
        onOpenChange={setExtraOpen}
        onSaved={refresh}
      />
      <TopicDialog
        lesson={topicLesson}
        onOpenChange={(open) => !open && setTopicLesson(null)}
        onSaved={refresh}
      />
    </div>
  );
}

function ExtraLessonDialog({
  groupId,
  open,
  onOpenChange,
  onSaved,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.attendance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    try {
      await api(`/groups/${groupId}/lessons/extra`, {
        method: "POST",
        body: {
          date: data.get("date"),
          startTime: data.get("startTime"),
          endTime: data.get("endTime"),
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFieldError(Object.values(e.fields)[0]?.[0]);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("extraLesson")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="extra-lesson-dialog"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="extra-date">{t("date")}</Label>
          <Input id="extra-date" name="date" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="extra-start">{t("start")}</Label>
          <Input id="extra-start" name="startTime" type="time" defaultValue="09:00" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="extra-end">{t("end")}</Label>
          <Input id="extra-end" name="endTime" type="time" defaultValue="10:30" required />
        </div>
      </div>
      <FieldError id="extra-error" message={fieldError} />
    </FormDialog>
  );
}

function TopicDialog({
  lesson,
  onOpenChange,
  onSaved,
}: {
  lesson: MonthGridDto["lessons"][number] | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.attendance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lesson) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/lessons/${lesson.id}`, {
        method: "PATCH",
        body: {
          topic: String(data.get("topic") ?? "").trim() || null,
          attachmentUrl: String(data.get("attachmentUrl") ?? "").trim() || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={!!lesson}
      onOpenChange={onOpenChange}
      title={t("setTopic")}
      description={lesson ? `${lesson.date} · ${lesson.startTime} – ${lesson.endTime}` : undefined}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="topic-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="topic">{t("topic")}</Label>
        <Input id="topic" name="topic" defaultValue={lesson?.topic ?? ""} key={lesson?.id} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="attachment">{t("attachment")}</Label>
        <Input
          id="attachment"
          name="attachmentUrl"
          type="url"
          defaultValue={lesson?.attachmentUrl ?? ""}
          key={`a-${lesson?.id}`}
        />
      </div>
    </FormDialog>
  );
}
