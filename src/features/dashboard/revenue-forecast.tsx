"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MultiBars } from "@/features/reports/charts";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type {
  ForecastSplitDto,
  RevenueForecastDto,
} from "@/server/services/finance/forecast.service";

/**
 * Revenue forecast on the home page (A-133): this month and the next as the fee
 * engine will charge them, against what is already paid, a six-month bar chart
 * and the split by course (and by branch when there are several).
 */
export function RevenueForecast({
  data,
  mask,
}: {
  data: RevenueForecastDto;
  /** The dashboard's "show numbers" switch: hides amounts until pressed. */
  mask: (value: string) => string;
}) {
  const t = useTranslations("dashboard.forecast");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const monthLabel = (m: string) => fmt(parseDateOnly(`${m}-01`), { month: "short" });
  const amount = (v: number) => mask(money(v));
  const percent = Math.min(100, data.current.percent);

  const split = (rows: ForecastSplitDto[], label: string, testId: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">{t("columns.expected")}</TableHead>
          <TableHead className="text-right">{t("columns.collected")}</TableHead>
          <TableHead className="text-right">{t("columns.next")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id ?? r.name ?? ""} data-testid={testId}>
            <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{amount(r.expected)}</TableCell>
            <TableCell className="text-right tabular-nums">{amount(r.collected)}</TableCell>
            <TableCell className="text-right tabular-nums">{amount(r.nextExpected)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <section className="space-y-3" data-testid="dashboard-forecast">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("hint", { count: data.memberships })}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card data-testid="forecast-this-month">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("thisMonth", { month: monthLabel(data.month) })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">{t("collected")}</div>
                <div
                  className="text-xl font-semibold tabular-nums"
                  data-testid="forecast-collected"
                >
                  {amount(data.current.collected)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{t("expected")}</div>
                <div className="text-xl font-semibold tabular-nums" data-testid="forecast-expected">
                  {amount(data.current.expected)}
                </div>
              </div>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground" data-testid="forecast-percent">
              {t("percent", { percent: mask(String(data.current.percent)) })}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="forecast-next-month">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("nextMonth", { month: monthLabel(data.nextMonth) })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xs text-muted-foreground">{t("expected")}</div>
            <div className="text-xl font-semibold tabular-nums">{amount(data.next.expected)}</div>
            <p className="text-xs text-muted-foreground">
              {t("prepaid", { amount: amount(data.next.collected) })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("chart")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiBars
              labels={data.months.map((m) => monthLabel(m.month))}
              series={[
                { name: t("series.expected"), values: data.months.map((m) => m.expected) },
                { name: t("series.collected"), values: data.months.map((m) => m.collected) },
              ]}
              format={amount}
            />
          </CardContent>
        </Card>
      </div>
      {data.byCourse.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("byCourse")}</CardTitle>
            </CardHeader>
            <CardContent>
              {split(data.byCourse, t("columns.course"), "forecast-course")}
            </CardContent>
          </Card>
          {data.byBranch.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t("byBranch")}</CardTitle>
              </CardHeader>
              <CardContent>
                {split(data.byBranch, t("columns.branch"), "forecast-branch")}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
