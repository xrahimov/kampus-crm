"use client";

import { CalendarClock, CalendarX2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { weekdayLabel } from "@/features/groups/weekday";
import type { ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { Weekday } from "@/lib/validation/groups";
import type {
  PortalScheduleDto,
  PortalUpcomingLessonDto,
} from "@/server/services/portal/reschedule.service";

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The Schedule tab: the weekly times, the next lessons with move/cancel for a
 * 1:1 student inside the centre's window, and lessons waiting for a new time (A-166).
 */
export function PortalScheduleTab({
  token,
  weekly,
  endDate,
  initial,
}: {
  token: string;
  weekly: Array<{ weekday: number; startTime: string; endTime: string }>;
  endDate: string;
  initial: PortalScheduleDto;
}) {
  const t = useTranslations("portal.schedule");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [data, setData] = useState(initial);
  const [picking, setPicking] = useState<
    | { kind: "move"; lesson: PortalUpcomingLessonDto }
    | { kind: "rebook"; dayOffId: string; length: number }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });
  const when = (iso: string) => fmt(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const base = `/api/v1/public/class/${encodeURIComponent(token)}/schedule`;

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
        const fields = payload?.error?.fields ?? {};
        setError(
          fields.startTime?.[0] ??
            fields.date?.[0] ??
            fields.endTime?.[0] ??
            payload?.error?.message ??
            "errors.internal",
        );
        return false;
      }
      setData((await response.json()) as PortalScheduleDto);
      setPicking(null);
      return true;
    } catch {
      setError("errors.internal");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="portal-schedule">
      {weekly.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {weekly.map((s) => (
            <li key={s.weekday} className="flex justify-between gap-2 py-2">
              <span>{weekdayLabel(fmt, s.weekday as Weekday, "long")}</span>
              <span className="tabular-nums">
                {s.startTime} – {s.endTime}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("until", { date: date(endDate) })}</p>

      {data.cancelled.length > 0 && (
        <section
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40"
          data-testid="portal-cancelled"
        >
          <h3 className="flex items-center gap-2 font-medium">
            <CalendarX2 className="size-4" aria-hidden /> {t("cancelledTitle")}
          </h3>
          <ul className="space-y-2">
            {data.cancelled.map((c) => (
              <li
                key={c.dayOffId}
                className="flex flex-wrap items-center justify-between gap-2"
                data-testid="portal-cancelled-lesson"
              >
                <span>
                  {date(c.date)}
                  {c.startTime && <span className="ml-2 tabular-nums">{c.startTime}</span>}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.reason.startsWith("@student.")
                      ? t(`reasons.${c.reason.slice("@student.".length)}`)
                      : c.reason}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPicking({
                      kind: "rebook",
                      dayOffId: c.dayOffId,
                      length:
                        c.startTime && c.endTime
                          ? minutes(c.endTime) - minutes(c.startTime)
                          : weekly[0]
                            ? minutes(weekly[0].endTime) - minutes(weekly[0].startTime)
                            : 60,
                    })
                  }
                  data-testid="portal-rebook"
                >
                  {t("pickTime")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.upcoming.length > 0 && (
        <section className="space-y-2" data-testid="portal-upcoming">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <CalendarClock className="size-4" aria-hidden /> {t("upcomingTitle")}
          </h3>
          {data.rules.enabled && (
            <p className="text-xs text-muted-foreground" data-testid="portal-reschedule-rule">
              {t("rule", { hours: data.rules.hours })}
            </p>
          )}
          <ul className="divide-y text-sm">
            {data.upcoming.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
                data-testid="portal-upcoming-lesson"
                data-can-change={l.canChange}
                data-date={l.date}
              >
                <span>
                  {date(l.date)}
                  <span className="ml-2 tabular-nums">
                    {l.startTime}–{l.endTime}
                  </span>
                  {l.topic && <span className="ml-2 text-xs text-muted-foreground">{l.topic}</span>}
                </span>
                {data.rules.enabled &&
                  (l.canChange ? (
                    <span className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPicking({ kind: "move", lesson: l })}
                        data-testid="portal-move"
                      >
                        {t("move")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void call(`${base}/${l.id}/cancel`)}
                        data-testid="portal-cancel"
                      >
                        {t("cancel")}
                      </Button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground" data-testid="portal-too-late">
                      {t("tooLate", { deadline: when(l.deadline) })}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {picking && (
        <PickTime
          busy={busy}
          error={error}
          length={
            picking.kind === "move"
              ? minutes(picking.lesson.endTime) - minutes(picking.lesson.startTime)
              : picking.length
          }
          initial={
            picking.kind === "move"
              ? { date: picking.lesson.date, startTime: picking.lesson.startTime }
              : { date: "", startTime: weekly[0]?.startTime ?? "10:00" }
          }
          onCancel={() => {
            setPicking(null);
            setError(null);
          }}
          onPick={(moveTo) =>
            void call(
              picking.kind === "move"
                ? `${base}/${picking.lesson.id}/move`
                : `${base}/rebook/${picking.dayOffId}`,
              moveTo,
            )
          }
        />
      )}
      {error && !picking && (
        <p role="alert" className="text-sm text-destructive">
          {te.has(error) ? te(error) : te("errors.internal")}
        </p>
      )}
    </div>
  );
}

function PickTime({
  busy,
  error,
  length,
  initial,
  onCancel,
  onPick,
}: {
  busy: boolean;
  error: string | null;
  /** Lesson length in minutes; the end time follows the start. */
  length: number;
  initial: { date: string; startTime: string };
  onCancel: () => void;
  onPick: (moveTo: { date: string; startTime: string; endTime: string }) => void;
}) {
  const t = useTranslations("portal.schedule");
  const te = useTranslations();
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const endTime = startTime ? hhmm(minutes(startTime) + length) : "";
  return (
    <form
      className="space-y-3 rounded-lg border p-3 text-sm"
      data-testid="portal-pick-time"
      onSubmit={(e) => {
        e.preventDefault();
        if (date && startTime) onPick({ date, startTime, endTime });
      }}
    >
      <p className="font-medium">{t("pickTitle")}</p>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label htmlFor="pick-date">{t("newDate")}</Label>
          <Input
            id="pick-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            data-testid="pick-date"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pick-time">{t("newTime")}</Label>
          <Input
            id="pick-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            data-testid="pick-time"
          />
        </div>
        <div className="space-y-1">
          <Label>{t("ends")}</Label>
          <div className="flex h-9 items-center tabular-nums" data-testid="pick-end">
            {endTime}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("pickHint")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {te.has(error) ? te(error) : te("errors.internal")}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || !date || !startTime}
          data-testid="pick-save"
        >
          {t("confirm")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {te("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
