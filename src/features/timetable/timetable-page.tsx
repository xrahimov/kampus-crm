"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { weekdayLabel } from "@/features/groups/weekday";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";
import { WEEKDAYS } from "@/lib/validation/groups";
import type {
  TimetableBlockDto,
  TimetableDto,
  TimetableMode,
} from "@/server/services/groups/clashes.service";

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Pixels per minute of the day column. */
const SCALE = 1.1;

/** One room's or one teacher's week (A-116): weekday columns, a block per group slot. */
export function TimetablePage({ data }: { data: TimetableDto }) {
  const t = useTranslations("timetable");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setParams(next: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const start = minutes(data.workStart);
  const end = Math.max(start + 60, minutes(data.workEnd));
  const height = (end - start) * SCALE;
  const hours: number[] = [];
  for (let m = Math.ceil(start / 60) * 60; m < end; m += 60) hours.push(m);
  const options = data.mode === "room" ? data.rooms : data.teachers;
  const label = (o: { id: string; name?: string; fullName?: string }) => o.name ?? o.fullName ?? "";
  const emptyOptions = data.mode === "room" ? t("noRooms") : t("noTeachers");

  const Block = ({ b }: { b: TimetableBlockDto }) => {
    const top = (Math.max(minutes(b.startTime), start) - start) * SCALE;
    const bottom = (Math.min(minutes(b.endTime), end) - start) * SCALE;
    const detail = data.mode === "room" ? b.teacherNames.join(", ") : (b.roomName ?? t("noRoom"));
    return (
      <Link
        href={`/groups/${b.groupId}`}
        className="absolute inset-x-0.5 overflow-hidden rounded-md border border-l-4 bg-card p-1.5 text-xs leading-tight shadow-xs transition-colors hover:bg-accent"
        style={{
          top,
          height: Math.max(bottom - top, 22),
          borderLeftColor: b.color ?? "var(--primary)",
        }}
        title={`${b.groupName} · ${b.courseName} · ${b.startTime}–${b.endTime}`}
        data-testid="timetable-block"
      >
        <div className="truncate font-medium">{b.groupName}</div>
        <div className="truncate text-muted-foreground">
          {b.startTime}–{b.endTime}
        </div>
        {detail && <div className="truncate text-muted-foreground">{detail}</div>}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.branches.length > 1 && (
            <Select
              value={data.branchId ?? ""}
              onValueChange={(v) => setParams({ branchId: v, id: null })}
            >
              <SelectTrigger
                className="w-44"
                aria-label={t("branch")}
                data-testid="timetable-branch"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tabs
            value={data.mode}
            onValueChange={(v) => setParams({ mode: v as TimetableMode, id: null })}
          >
            <TabsList>
              <TabsTrigger value="room">{t("byRoom")}</TabsTrigger>
              <TabsTrigger value="teacher">{t("byTeacher")}</TabsTrigger>
            </TabsList>
          </Tabs>
          {options.length > 0 ? (
            <Select value={data.selectedId ?? ""} onValueChange={(v) => setParams({ id: v })}>
              <SelectTrigger
                className="w-52"
                aria-label={data.mode === "room" ? t("room") : t("teacher")}
                data-testid="timetable-pick"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {label(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">{emptyOptions}</span>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <div className="min-w-[840px]">
            <div
              className="grid gap-px"
              style={{ gridTemplateColumns: "3.25rem repeat(7, minmax(0, 1fr))" }}
            >
              <div />
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-2 text-center text-sm font-medium">
                  {weekdayLabel(fmt, w, "short")}
                </div>
              ))}
              <div className="relative" style={{ height }}>
                {hours.map((m) => (
                  <div
                    key={m}
                    className="absolute right-1 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                    style={{ top: (m - start) * SCALE }}
                  >
                    {String(m / 60).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="relative rounded-md border bg-muted/30"
                  style={{ height }}
                  data-testid={`timetable-day-${w}`}
                >
                  {hours.map((m) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 border-t border-dashed border-border/70"
                      style={{ top: (m - start) * SCALE }}
                    />
                  ))}
                  {data.blocks
                    .filter((b) => b.weekday === w)
                    .map((b) => (
                      <Block key={`${b.groupId}-${b.startTime}`} b={b} />
                    ))}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t("hours", { start: data.workStart, end: data.workEnd })}</span>
              {data.blocks.length === 0 && <span data-testid="timetable-empty">{t("empty")}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
