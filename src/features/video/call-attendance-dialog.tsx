"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CallAttendanceDto } from "@/server/services/video/call-attendance.service";

type Mark = "PRESENT" | "ABSENT" | "EXCUSED";
const MARKS: Mark[] = ["PRESENT", "ABSENT", "EXCUSED"];

/**
 * Attendance from a video lesson (online-lessons B1): the call's minutes per
 * student turn into proposed marks; the teacher fixes what is wrong and applies.
 */
export function CallAttendanceDialog({
  roomId,
  open,
  onOpenChange,
  onApplied,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}) {
  const t = useTranslations("video.attendance");
  const ts = useTranslations("groups.attendance");
  const te = useTranslations();
  const [data, setData] = useState<CallAttendanceDto | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void api<CallAttendanceDto>(`/video/rooms/${roomId}/attendance`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        setMarks(
          Object.fromEntries(
            d.rows.map((r) => [
              r.membershipId,
              (r.current && r.current !== "NOT_MARKED" ? r.current : r.suggested) as Mark,
            ]),
          ),
        );
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "errors.internal"));
    return () => {
      alive = false;
    };
  }, [open, roomId]);

  async function apply() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/video/rooms/${roomId}/attendance`, {
        method: "POST",
        body: {
          marks: data.rows.map((r) => ({
            membershipId: r.membershipId,
            status: marks[r.membershipId],
          })),
        },
      });
      onApplied?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="call-attendance">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { minutes: data?.thresholdMinutes ?? 10 })}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">{te.has(error) ? te(error) : te("errors.internal")}</Alert>
        )}
        {data && !data.lessonId && <Alert>{t("noLesson")}</Alert>}
        {data && (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
            {data.rows.map((r) => (
              <li
                key={r.membershipId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                data-testid="call-attendance-row"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.minutes > 0 ? t("minutes", { count: r.minutes }) : t("notInCall")}
                    {r.lateMinutes !== null &&
                      r.lateMinutes > data.thresholdMinutes &&
                      ` · ${t("late", { count: r.lateMinutes })}`}
                    {r.current && ` · ${t("already", { status: ts(r.current) })}`}
                  </p>
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label={r.fullName}>
                  {MARKS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={marks[r.membershipId] === m}
                      onClick={() => setMarks((cur) => ({ ...cur, [r.membershipId]: m }))}
                      data-testid={`call-attendance-${m.toLowerCase()}`}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs",
                        marks[r.membershipId] === m
                          ? m === "PRESENT"
                            ? "border-transparent bg-success/20 font-medium"
                            : m === "ABSENT"
                              ? "border-transparent bg-destructive/15 font-medium text-destructive"
                              : "border-transparent bg-muted font-medium"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {ts(m)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {te("common.cancel")}
          </Button>
          <Button
            onClick={apply}
            disabled={!data?.lessonId || saving || data.rows.length === 0}
            data-testid="call-attendance-apply"
          >
            {saving ? t("applying") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
