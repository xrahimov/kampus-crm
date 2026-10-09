"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  /** Small text under the value (a count, a name). */
  hint?: string | null;
  /** Percent change against the previous period; null when it cannot be computed. */
  change?: number | null;
}

/** The KPI card row of the reports (EXP §10), with the "% change" badge where the reference shows one. */
export function KpiCards({ items, columns = 3 }: { items: KpiItem[]; columns?: 3 | 4 | 6 }) {
  const grid =
    columns === 6
      ? "sm:grid-cols-3 xl:grid-cols-6"
      : columns === 4
        ? "sm:grid-cols-2 xl:grid-cols-4"
        : "sm:grid-cols-3";
  return (
    <div className={cn("grid gap-3", grid)}>
      {items.map((k) => (
        <Card key={k.key} data-testid={`kpi-${k.key}`}>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <div className="text-xl font-semibold tabular-nums">{k.value}</div>
              {k.change !== undefined && k.change !== null && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    k.change > 0
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : k.change < 0
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {k.change > 0 ? "+" : ""}
                  {k.change}%
                </span>
              )}
            </div>
            {k.hint && <div className="mt-1 truncate text-xs text-muted-foreground">{k.hint}</div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
