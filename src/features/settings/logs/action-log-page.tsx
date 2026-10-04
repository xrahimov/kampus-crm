"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDateFormat } from "@/lib/use-date-format";
import type { Page } from "@/lib/validation/common";
import type { ActionLogFilters } from "@/lib/validation/integrations";
import { ACTION_LOG_ENTITIES } from "@/lib/validation/integrations";
import type { ActionLogRowDto } from "@/server/services/logs/logs.service";

import { DateRange } from "./date-range";
import { ALL, useLogParams } from "./log-filters";

/** Short "old → new" details for the feed, from the audit row's before/after. */
function Details({ before, after }: { before: unknown; after: unknown }) {
  const keys = new Set<string>();
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  for (const k of [...Object.keys(b), ...Object.keys(a)]) keys.add(k);
  const changes = [...keys]
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .filter((k) => typeof a[k] !== "object" && typeof b[k] !== "object")
    .slice(0, 4);
  if (changes.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      {changes.map((k) => (
        <li key={k}>
          <span className="font-medium">{k}</span>: {before && k in b ? `${String(b[k])} → ` : ""}
          {String(a[k] ?? "—")}
        </li>
      ))}
    </ul>
  );
}

/** Settings → action feed (EXP §8 Action log): who did what to whom, with details. */
export function ActionLogPage({
  page,
  filters,
  actors,
}: {
  page: Page<ActionLogRowDto>;
  filters: ActionLogFilters;
  actors: Array<{ id: string; fullName: string }>;
}) {
  const t = useTranslations("logs.actions");
  const fmt = useDateFormat();
  const setParam = useLogParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox />
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("entity")}</Label>
            <Select value={filters.entity ?? ALL} onValueChange={(v) => setParam("entity", v)}>
              <SelectTrigger data-testid="actions-entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                {ACTION_LOG_ENTITIES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t(`entities.${e}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("staff")}</Label>
            <Select value={filters.actorId ?? ALL} onValueChange={(v) => setParam("actorId", v)}>
              <SelectTrigger data-testid="actions-actor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRange from={filters.from} to={filters.to} onChange={setParam} idPrefix="actions" />
        </div>
        {page.items.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <ul className="divide-y">
            {page.items.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-3 py-3" data-testid="action-row">
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {t.has(`names.${r.action}`) ? t(`names.${r.action}`) : r.action}
                    </span>
                    <Badge variant="outline">
                      {t.has(`entities.${r.entity}`) ? t(`entities.${r.entity}`) : r.entity}
                    </Badge>
                    {r.branchName && (
                      <span className="text-xs text-muted-foreground">{r.branchName}</span>
                    )}
                  </div>
                  {r.subjectName && <div className="text-sm">{r.subjectName}</div>}
                  <Details before={r.before} after={r.after} />
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">{r.actorName ?? t("system")}</div>
                  {r.actorPhone && (
                    <div className="text-xs text-muted-foreground tabular-nums">{r.actorPhone}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {fmt(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
      </CardContent>
    </Card>
  );
}
