"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { weekdayLabel } from "@/features/groups/weekday";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { AVAILABILITY_MAX, WEEKDAYS, type Weekday } from "@/lib/validation/groups";
import type { AvailabilityWindowDto } from "@/server/services/staff/availability.service";

/**
 * A teacher's hours open for 1:1 booking (A-169): windows per weekday, saved
 * as a whole. Used on the teacher's page and on the teacher's own account page.
 */
export function AvailabilityEditor({
  userId,
  initial,
  canEdit,
}: {
  userId: string;
  initial: AvailabilityWindowDto[];
  canEdit: boolean;
}) {
  const t = useTranslations("teachers.availability");
  const te = useTranslations();
  const fmt = useDateFormat();
  const [windows, setWindows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(windows) !== JSON.stringify(initial);

  const update = (index: number, patch: Partial<AvailabilityWindowDto>) =>
    setWindows((ws) => ws.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  const add = (weekday: Weekday) =>
    setWindows((ws) =>
      [...ws, { weekday, startTime: "14:00", endTime: "18:00" }].sort(
        (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
      ),
    );

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api<AvailabilityWindowDto[]>(`/teachers/${userId}/availability`, {
        method: "PUT",
        body: { windows },
      });
      setWindows(next);
      setSaved(true);
    } catch (e) {
      const key =
        e instanceof ApiError
          ? (e.fields?.windows?.[0] ?? e.fields?.endTime?.[0] ?? e.message)
          : "errors.internal";
      setError(te.has(key) ? te(key) : te("errors.internal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="availability-editor">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <ul className="divide-y text-sm">
        {WEEKDAYS.map((weekday) => {
          const mine = windows
            .map((w, index) => ({ ...w, index }))
            .filter((w) => w.weekday === weekday);
          return (
            <li
              key={weekday}
              className="flex flex-wrap items-center gap-2 py-2"
              data-testid={`availability-day-${weekday}`}
            >
              <span className="w-28 font-medium">{weekdayLabel(fmt, weekday, "long")}</span>
              {mine.length === 0 && (
                <span className="text-xs text-muted-foreground">{t("closed")}</span>
              )}
              {mine.map((w) => (
                <span key={w.index} className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={w.startTime}
                    disabled={!canEdit}
                    onChange={(e) => update(w.index, { startTime: e.target.value })}
                    className="h-8 w-28"
                    aria-label={t("from")}
                    data-testid="availability-start"
                  />
                  <span>–</span>
                  <Input
                    type="time"
                    value={w.endTime}
                    disabled={!canEdit}
                    onChange={(e) => update(w.index, { endTime: e.target.value })}
                    className="h-8 w-28"
                    aria-label={t("to")}
                    data-testid="availability-end"
                  />
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("remove")}
                      onClick={() => setWindows((ws) => ws.filter((_, i) => i !== w.index))}
                      data-testid="availability-remove"
                    >
                      <Trash2 />
                    </Button>
                  )}
                </span>
              ))}
              {canEdit && windows.length < AVAILABILITY_MAX && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => add(weekday)}
                  data-testid={`availability-add-${weekday}`}
                >
                  <Plus /> {t("add")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={busy || !dirty}
            onClick={() => void save()}
            data-testid="availability-save"
          >
            {t("save")}
          </Button>
          {saved && !dirty && (
            <span className="text-xs text-muted-foreground" data-testid="availability-saved">
              {t("saved")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
