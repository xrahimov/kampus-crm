"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CallStatusBadge, formatDuration } from "@/features/students/calls-tab";
import { Link, useRouter } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";
import type { Page } from "@/lib/validation/common";
import { CALL_DIRECTIONS, CALL_STATUSES, type CallFilters } from "@/lib/validation/integrations";
import type { CallDto } from "@/server/services/calls/calls.service";

import { DateRange } from "../logs/date-range";
import { ALL, useLogParams } from "../logs/log-filters";

/** "Qo'ng'iroqlar" (EXP §8 Calls): refresh, direction, status, dates. */
export function CallsPage({ page, filters }: { page: Page<CallDto>; filters: CallFilters }) {
  const t = useTranslations("calls");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const setParam = useLogParams();

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startTransition(() => router.refresh())}
          data-testid="calls-refresh"
        >
          <RefreshCw /> {t("refresh")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox />
          <div className="min-w-36 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("columns.direction")}</Label>
            <Select
              value={filters.direction ?? ALL}
              onValueChange={(v) => setParam("direction", v)}
            >
              <SelectTrigger data-testid="calls-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                {CALL_DIRECTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t(`directions.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-36 space-y-1">
            <Label className="text-xs text-muted-foreground">{tc("status")}</Label>
            <Select value={filters.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
              <SelectTrigger data-testid="calls-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                {CALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DateRange from={filters.from} to={filters.to} onChange={setParam} idPrefix="calls" />
        </div>
        {page.items.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.startedAt")}</TableHead>
                  <TableHead>{t("columns.direction")}</TableHead>
                  <TableHead>{t("columns.phones")}</TableHead>
                  <TableHead>{t("columns.student")}</TableHead>
                  <TableHead>{t("columns.staff")}</TableHead>
                  <TableHead>{t("columns.duration")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.items.map((c) => (
                  <TableRow key={c.id} data-testid="call-row">
                    <TableCell className="whitespace-nowrap">
                      {fmt(new Date(c.startedAt), { dateStyle: "medium", timeStyle: "short" })}
                    </TableCell>
                    <TableCell>{t(`directions.${c.direction}`)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {c.fromPhone} → {c.toPhone}
                    </TableCell>
                    <TableCell>
                      {c.studentId ? (
                        <Link href={`/students/${c.studentId}`} className="hover:underline">
                          {c.studentName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{c.staffName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDuration(c.durationSeconds)}
                    </TableCell>
                    <TableCell>
                      <CallStatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
      </CardContent>
    </Card>
  );
}
