"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { weekdayLabel } from "@/features/groups/weekday";
import { Link } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";
import { SCHEDULE_STEPS } from "@/lib/validation/dashboard";
import { WEEKDAYS, type Weekday } from "@/lib/validation/groups";
import type { ScheduleBlockDto, ScheduleDto } from "@/server/services/dashboard/schedule.service";

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** EXP §1: weekday tabs, "Vaqt oralig'i" select, rooms × time slots with a block per group. */
export function ScheduleGrid({
  schedule,
  onChange,
}: {
  schedule: ScheduleDto;
  onChange: (next: { weekday?: number; step?: number }) => void;
}) {
  const t = useTranslations("dashboard.schedule");
  const fmt = useDateFormat();
  const start = minutes(schedule.workStart);
  const end = minutes(schedule.workEnd);
  const total = Math.max(1, end - start);
  const columns = schedule.slots.length;
  const stepMin = schedule.step;

  const Block = ({ b }: { b: ScheduleBlockDto }) => {
    const from = Math.max(start, minutes(b.startTime));
    const to = Math.min(end, minutes(b.endTime));
    if (to <= from) return null;
    const colStart = Math.floor((from - start) / stepMin) + 1;
    const colEnd = Math.ceil((to - start) / stepMin) + 1;
    return (
      <Link
        href={`/groups/${b.groupId}`}
        className="truncate rounded-md border px-2 py-1 text-xs leading-tight text-white shadow-sm hover:opacity-90"
        style={{
          gridColumn: `${colStart} / ${colEnd}`,
          background: b.color ?? "#0f766e",
          borderColor: "rgba(0,0,0,.15)",
        }}
        title={`${b.startTime} – ${b.endTime} · ${b.courseName} | ${b.groupName}`}
        data-testid="schedule-block"
      >
        <div className="truncate font-medium">
          {b.startTime} – {b.endTime} / {b.courseName} | {b.groupName}
        </div>
        <div className="truncate opacity-90">
          {t("teacher")}: {b.teacherName ?? "—"}
        </div>
      </Link>
    );
  };

  return (
    <Card data-testid="schedule">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t("title")}</CardTitle>
          <Select
            value={String(schedule.step)}
            onValueChange={(v) => onChange({ step: Number(v) })}
          >
            <SelectTrigger className="w-40" aria-label={t("step")} data-testid="schedule-step">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULE_STEPS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {t("minutes", { count: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs
          value={String(schedule.weekday)}
          onValueChange={(v) => onChange({ weekday: Number(v) })}
        >
          <TabsList className="flex-wrap">
            {WEEKDAYS.map((d) => (
              <TabsTrigger key={d} value={String(d)} data-testid={`schedule-day-${d}`}>
                {weekdayLabel(fmt, d as Weekday, "long")}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {schedule.rooms.length === 0 && schedule.unassigned.length === 0 ? (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px] space-y-1" style={{ ["--cols" as string]: columns }}>
              <div
                className="grid gap-px pl-28 text-[11px] text-muted-foreground"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {schedule.slots.map((s, i) => (
                  <div key={s} className={i % (60 / stepMin) === 0 ? "" : "opacity-50"}>
                    {s}
                  </div>
                ))}
              </div>
              {schedule.rooms.map((room) => (
                <div key={room.id} className="flex items-stretch gap-0" data-testid="schedule-room">
                  <div className="w-28 shrink-0 truncate py-2 pr-2 text-sm font-medium">
                    {room.name}
                    <span className="ml-1 text-xs text-muted-foreground">({room.capacity})</span>
                  </div>
                  <div
                    className="grid min-h-12 flex-1 gap-px rounded-md bg-muted/40 p-px"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  >
                    {room.blocks.length === 0 ? (
                      <div className="col-span-full self-center px-2 text-xs text-muted-foreground">
                        {t("free")}
                      </div>
                    ) : (
                      room.blocks.map((b) => <Block key={`${b.groupId}-${b.startTime}`} b={b} />)
                    )}
                  </div>
                </div>
              ))}
              {schedule.unassigned.length > 0 && (
                <div className="flex items-stretch gap-0" data-testid="schedule-unassigned">
                  <div className="w-28 shrink-0 truncate py-2 pr-2 text-sm font-medium text-muted-foreground">
                    {t("noRoom")}
                  </div>
                  <div
                    className="grid min-h-12 flex-1 gap-px rounded-md bg-muted/40 p-px"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  >
                    {schedule.unassigned.map((b) => (
                      <Block key={`${b.groupId}-${b.startTime}`} b={b} />
                    ))}
                  </div>
                </div>
              )}
              <p className="pt-1 text-xs text-muted-foreground">
                {t("hours", { start: schedule.workStart, end: schedule.workEnd })} · {total / 60}{" "}
                {t("h")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
