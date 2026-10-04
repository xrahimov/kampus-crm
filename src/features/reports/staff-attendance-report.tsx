"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { STAFF_ATTENDANCE_TABS, type StaffAttendanceTab } from "@/lib/validation/integrations";
import type {
  DayStatus,
  ScheduleRowDto,
  StaffAttendanceReportDto,
  StaffDayRowDto,
} from "@/server/services/attendance/staff-attendance.service";

const ALL = "__all";
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Monday first

function minutes(n: number): string {
  if (n === 0) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m}m`;
}

function StatusBadge({ status }: { status: DayStatus }) {
  const t = useTranslations("staffAttendance.statuses");
  const variant =
    status === "PRESENT"
      ? "success"
      : status === "LATE"
        ? "destructive"
        : status === "ABSENT"
          ? "destructive"
          : status === "NO_SCHEDULE"
            ? "secondary"
            : "outline";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Reports → "Hodimlar davomati boshqaruv paneli" (EXP §10): KPIs and five tabs. */
export function StaffAttendanceReport({
  report,
  tab,
  branches,
  canEdit,
}: {
  report: StaffAttendanceReportDto;
  tab: StaffAttendanceTab;
  branches: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const t = useTranslations("staffAttendance");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [editingDay, setEditingDay] = useState<StaffDayRowDto | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRowDto | null>(null);

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const years = Array.from({ length: 5 }, (_, i) => report.year - 2 + i);
  const kpis: Array<[string, number]> = [
    [t("kpis.total"), report.kpis.total],
    [t("kpis.cameToday"), report.kpis.cameToday],
    [t("kpis.lateToday"), report.kpis.lateToday],
    [t("kpis.absentToday"), report.kpis.absentToday],
  ];
  const day = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-32 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.month")}</Label>
          <Select
            value={String(report.month)}
            onValueChange={(v) => setParams({ month: v, date: null })}
          >
            <SelectTrigger data-testid="attendance-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {fmt(new Date(Date.UTC(report.year, m - 1, 1)), {
                    month: "short",
                    year: "numeric",
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-24 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.year")}</Label>
          <Select
            value={String(report.year)}
            onValueChange={(v) => setParams({ year: v, date: null })}
          >
            <SelectTrigger data-testid="attendance-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {branches.length > 1 && (
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("filters.branch")}</Label>
            <Select
              value={report.branchId ?? ALL}
              onValueChange={(v) => setParams({ branchId: v })}
            >
              <SelectTrigger data-testid="attendance-branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{tc("allBranches")}</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {(tab === "daily" || tab === "weekly") && (
          <div className="space-y-1">
            <Label htmlFor="attendance-date" className="text-xs text-muted-foreground">
              {t("filters.date")}
            </Label>
            <Input
              id="attendance-date"
              type="date"
              value={report.date}
              onChange={(e) => setParams({ date: e.target.value || null })}
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="attendance-kpi">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "daily" ? null : v })}>
        <TabsList className="h-auto flex-wrap">
          {STAFF_ATTENDANCE_TABS.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`attendance-tab-${k}`}>
              {t(`tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {report.daily.length === 0 ? (
            <EmptyState title={t("noStaff")} />
          ) : tab === "daily" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("columns.staff")}</TableHead>
                  <TableHead>{t("columns.branch")}</TableHead>
                  <TableHead>{t("columns.expectedIn")}</TableHead>
                  <TableHead>{t("columns.checkIn")}</TableHead>
                  <TableHead>{t("columns.expectedOut")}</TableHead>
                  <TableHead>{t("columns.checkOut")}</TableHead>
                  <TableHead>{t("columns.late")}</TableHead>
                  <TableHead>{t("columns.earlyLeave")}</TableHead>
                  <TableHead>{t("columns.worked")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  {canEdit && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.daily.map((r, i) => (
                  <TableRow key={r.userId} data-testid="attendance-day-row">
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    <TableCell>{r.branchName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.expectedIn ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.checkIn ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.expectedOut ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.checkOut ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{minutes(r.lateMinutes)}</TableCell>
                    <TableCell className="tabular-nums">{minutes(r.earlyLeaveMinutes)}</TableCell>
                    <TableCell className="tabular-nums">{minutes(r.workedMinutes)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tc("actionsFor", { name: r.fullName })}
                          onClick={() => setEditingDay(r)}
                          data-testid="edit-check"
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === "weekly" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.staff")}</TableHead>
                  {report.weekly.rows[0]?.days.map((d) => (
                    <TableHead key={d.date} className="text-center">
                      {day(d.date)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.weekly.rows.map((r) => (
                  <TableRow key={r.userId} data-testid="attendance-week-row">
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    {r.days.map((d) => (
                      <TableCell key={d.date} className="text-center">
                        <StatusBadge status={d.status} />
                        {d.checkIn && (
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {d.checkIn}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === "monthly" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.staff")}</TableHead>
                  <TableHead>{t("columns.branch")}</TableHead>
                  <TableHead className="text-right">{t("columns.workingDays")}</TableHead>
                  <TableHead className="text-right">{t("columns.presentDays")}</TableHead>
                  <TableHead className="text-right">{t("columns.lateDays")}</TableHead>
                  <TableHead className="text-right">{t("columns.absentDays")}</TableHead>
                  <TableHead className="text-right">{t("columns.worked")}</TableHead>
                  <TableHead className="text-right">{t("columns.late")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.monthly.map((r) => (
                  <TableRow key={r.userId} data-testid="attendance-month-row">
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    <TableCell>{r.branchName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.workingDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.presentDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.lateDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.absentDays}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {minutes(r.workedMinutes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {minutes(r.lateMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === "statistics" ? (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    [t("stats.attendanceRate"), `${report.statistics.attendanceRate}%`],
                    [t("stats.punctualityRate"), `${report.statistics.punctualityRate}%`],
                    [t("stats.avgWorked"), minutes(report.statistics.avgWorkedMinutes)],
                  ] as Array<[string, string]>
                ).map(([label, value]) => (
                  <div key={label} className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div
                      className="text-xl font-semibold tabular-nums"
                      data-testid="attendance-stat"
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t("stats.byDay")}</h3>
                <div className="flex h-40 items-end gap-1" role="img" aria-label={t("stats.byDay")}>
                  {report.statistics.byDay.map((d) => {
                    const total = d.present + d.late + d.absent || 1;
                    return (
                      <div
                        key={d.date}
                        className="flex flex-1 flex-col justify-end"
                        title={`${day(d.date)}: ${d.present}/${d.late}/${d.absent}`}
                      >
                        <div
                          className="bg-destructive/70"
                          style={{ height: `${(d.absent / total) * 100}%` }}
                        />
                        <div
                          className="bg-warning"
                          style={{ height: `${(d.late / total) * 100}%` }}
                        />
                        <div
                          className="bg-success"
                          style={{ height: `${(d.present / total) * 100}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("stats.legend")}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.staff")}</TableHead>
                  {WEEKDAYS.map((w) => (
                    <TableHead key={w} className="text-center">
                      {fmt(new Date(Date.UTC(2024, 0, 7 + w)), { weekday: "short" })}
                    </TableHead>
                  ))}
                  {canEdit && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.schedules.map((r) => (
                  <TableRow key={r.userId} data-testid="schedule-row">
                    <TableCell className="font-medium">{r.fullName}</TableCell>
                    {WEEKDAYS.map((w) => {
                      const d = r.days[w];
                      return (
                        <TableCell key={w} className="text-center text-sm tabular-nums">
                          {d ? (
                            `${d.start}–${d.end}`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    {canEdit && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tc("actionsFor", { name: r.fullName })}
                          onClick={() => setEditingSchedule(r)}
                          data-testid="edit-schedule"
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ManualCheckDialog
        row={editingDay}
        date={report.date}
        onOpenChange={(open) => {
          if (!open) setEditingDay(null);
        }}
        onSaved={refresh}
      />
      <ScheduleDialog
        row={editingSchedule}
        onOpenChange={(open) => {
          if (!open) setEditingSchedule(null);
        }}
        onSaved={refresh}
      />
    </div>
  );
}

function ManualCheckDialog({
  row,
  date,
  onOpenChange,
  onSaved,
}: {
  row: StaffDayRowDto | null;
  date: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("staffAttendance");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Seed the inputs from the row when a new row opens (state reset in render, not in an effect).
  const key = row ? `${row.userId}:${date}` : null;
  if (key && key !== loadedFor) {
    setLoadedFor(key);
    setCheckIn(row?.checkIn ?? "");
    setCheckOut(row?.checkOut ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    setSubmitting(true);
    setError(null);
    try {
      await api("/staff-attendance/manual", {
        method: "PUT",
        body: { userId: row.userId, date, checkIn: checkIn || null, checkOut: checkOut || null },
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "errors.internal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={row !== null}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setLoadedFor(null);
        }
        onOpenChange(next);
      }}
      title={t("manualCheck", { name: row?.fullName ?? "" })}
      description={date}
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      testId="manual-check-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="manual-in">{t("columns.checkIn")}</Label>
          <Input
            id="manual-in"
            type="time"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-out">{t("columns.checkOut")}</Label>
          <Input
            id="manual-out"
            type="time"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  );
}

type DayDraft = { on: boolean; start: string; end: string };

function ScheduleDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: ScheduleRowDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("staffAttendance");
  const fmt = useDateFormat();
  const [days, setDays] = useState<DayDraft[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (row && row.userId !== loadedFor) {
    setLoadedFor(row.userId);
    setDays(
      Array.from({ length: 7 }, (_, w) => {
        const d = row.days[w];
        return d
          ? { on: true, start: d.start, end: d.end }
          : { on: false, start: "09:00", end: "18:00" };
      }),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    setSubmitting(true);
    setError(null);
    try {
      await api("/work-schedules", {
        method: "PUT",
        body: {
          userId: row.userId,
          days: days
            .map((d, weekday) => ({ ...d, weekday }))
            .filter((d) => d.on)
            .map(({ weekday, start, end }) => ({ weekday, start, end })),
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "errors.internal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={row !== null}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setLoadedFor(null);
        }
        onOpenChange(next);
      }}
      title={t("scheduleFor", { name: row?.fullName ?? "" })}
      description={t("scheduleHint")}
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      testId="schedule-dialog"
    >
      <div className="space-y-2">
        {WEEKDAYS.map((w) => {
          const d = days[w] ?? { on: false, start: "09:00", end: "18:00" };
          return (
            <div key={w} className="flex items-center gap-3" data-testid="schedule-day">
              <label className="flex w-24 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.on}
                  onChange={(e) =>
                    setDays((ds) =>
                      ds.map((x, i) => (i === w ? { ...x, on: e.target.checked } : x)),
                    )
                  }
                />
                {fmt(new Date(Date.UTC(2024, 0, 7 + w)), { weekday: "short" })}
              </label>
              <Input
                type="time"
                className="w-28"
                value={d.start}
                disabled={!d.on}
                aria-label={t("columns.expectedIn")}
                onChange={(e) =>
                  setDays((ds) => ds.map((x, i) => (i === w ? { ...x, start: e.target.value } : x)))
                }
              />
              <Input
                type="time"
                className="w-28"
                value={d.end}
                disabled={!d.on}
                aria-label={t("columns.expectedOut")}
                onChange={(e) =>
                  setDays((ds) => ds.map((x, i) => (i === w ? { ...x, end: e.target.value } : x)))
                }
              />
            </div>
          );
        })}
      </div>
    </FormDialog>
  );
}
