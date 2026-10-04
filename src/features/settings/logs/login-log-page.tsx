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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDateFormat } from "@/lib/use-date-format";
import type { Page } from "@/lib/validation/common";
import type { LoginLogFilters } from "@/lib/validation/integrations";
import type { LoginLogRowDto } from "@/server/services/logs/logs.service";

import { DateRange } from "./date-range";
import { ALL, useLogParams } from "./log-filters";

/** Settings → "Tizimga kirishlar" (EXP §8 Login log): ID, name, phone, time. */
export function LoginLogPage({
  page,
  filters,
}: {
  page: Page<LoginLogRowDto>;
  filters: LoginLogFilters;
}) {
  const t = useTranslations("logs.logins");
  const fmt = useDateFormat();
  const setParam = useLogParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { count: page.total })}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox />
          <div className="min-w-36 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("outcome")}</Label>
            <Select value={filters.success ?? ALL} onValueChange={(v) => setParam("success", v)}>
              <SelectTrigger data-testid="logins-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("all")}</SelectItem>
                <SelectItem value="true">{t("success")}</SelectItem>
                <SelectItem value="false">{t("failure")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DateRange from={filters.from} to={filters.to} onChange={setParam} idPrefix="logins" />
        </div>
        {page.items.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.phone")}</TableHead>
                <TableHead>{t("columns.at")}</TableHead>
                <TableHead>{t("columns.ip")}</TableHead>
                <TableHead>{t("outcome")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((r) => (
                <TableRow key={r.id} data-testid="login-row">
                  <TableCell className="font-medium">{r.userName ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{r.phone}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmt(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.ip ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.success ? "success" : "destructive"}>
                      {r.success ? t("success") : t("failure")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
      </CardContent>
    </Card>
  );
}
