"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { MonthGridDto } from "@/server/services/groups/lessons.service";

import { ExcelLink } from "@/features/shared/excel-link";

import { MonthTabs } from "./month-tabs";

/** EXP §5 BAHO: students × lesson dates with a score per cell and the average per student. */
export function GradesGrid({
  groupId,
  months,
  grid,
  gradingSystemName,
  canMark,
}: {
  groupId: string;
  months: string[];
  grid: MonthGridDto;
  gradingSystemName: string;
  canMark: boolean;
}) {
  const t = useTranslations("groups.grades");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save(
    lessonId: string,
    membershipId: string,
    raw: string,
    previous: number | undefined,
  ) {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value === previous || (value === null && previous === undefined)) return;
    if (value !== null && Number.isNaN(value)) return;
    setError(null);
    try {
      await api(`/lessons/${lessonId}/grades`, {
        method: "PUT",
        body: { grades: [{ membershipId, score: value }] },
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message)
          : "errors.internal",
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthTabs months={months} current={grid.month} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t("system")}: {gradingSystemName || "—"}
          </span>
          <ExcelLink
            path={`/groups/${groupId}/grades.xlsx`}
            params={{ month: grid.month }}
            testId="grades-excel"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {grid.lessons.length === 0 || grid.members.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-testid="grades-grid">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left font-medium">
                  {t("student")}
                </th>
                {grid.lessons.map((l) => (
                  <th key={l.id} className="px-1 py-2 text-center font-medium whitespace-nowrap">
                    {fmt(parseDateOnly(l.date), { day: "numeric", month: "short" })}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{t("average")}</th>
              </tr>
            </thead>
            <tbody>
              {grid.members.map((m) => (
                <tr key={m.membershipId} className="border-b last:border-0">
                  <td className="sticky left-0 bg-card px-3 py-1.5 whitespace-nowrap">
                    {m.fullName}
                  </td>
                  {grid.lessons.map((l) => {
                    const current = l.grades[m.membershipId]?.score;
                    return (
                      <td key={l.id} className="px-1 py-1 text-center">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          defaultValue={current ?? ""}
                          key={`${l.id}-${m.membershipId}-${current ?? ""}`}
                          disabled={!canMark}
                          aria-label={`${m.fullName} ${l.date}`}
                          onBlur={(e) => save(l.id, m.membershipId, e.target.value, current)}
                          className="w-14 rounded border bg-transparent px-1 py-0.5 text-center tabular-nums focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden disabled:border-transparent"
                        />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                    {m.average ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
