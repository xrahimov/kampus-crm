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
import { ExcelLink } from "@/features/shared/excel-link";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { LeadsReportFilters } from "@/lib/validation/reports";
import type { LeadsReportDto } from "@/server/services/reports/leads-report.service";

import { Bars, HBars, MultiBars } from "./charts";
import { KpiCards } from "./kpi-cards";
import { OptionSelect, PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "Lidlar hisoboti" (EXP §10): KPIs, the sales funnel, leads per month, by course and by source. */
export function LeadsReport({
  report,
  filters,
  branches,
}: {
  report: LeadsReportDto;
  filters: LeadsReportFilters;
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("reports.leads");
  const tf = useTranslations("reports.filters");
  const fmt = useDateFormat();
  const { params, set } = useReportParams();
  const k = report.kpis;
  const kpis = [
    { key: "newLeads", label: t("kpis.newLeads"), value: String(k.newLeads) },
    { key: "conversions", label: t("kpis.conversions"), value: String(k.conversions) },
    { key: "lost", label: t("kpis.lost"), value: String(k.lost) },
    {
      key: "bestSource",
      label: t("kpis.bestSource"),
      value: k.bestSource?.name ?? "—",
      hint: k.bestSource ? t("kpis.leadsCount", { count: k.bestSource.count }) : null,
    },
    { key: "trials", label: t("kpis.trials"), value: String(k.trials) },
    { key: "trialsAttended", label: t("kpis.trialsAttended"), value: String(k.trialsAttended) },
    {
      key: "bestSalesperson",
      label: t("kpis.bestSalesperson"),
      value: k.bestSalesperson?.name ?? "—",
      hint: k.bestSalesperson
        ? t("kpis.conversionsCount", { count: k.bestSalesperson.count })
        : null,
    },
  ];
  const monthLabels = report.byMonth.map((m) =>
    fmt(parseDateOnly(`${m.month}-01`), { month: "short" }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ExcelLink path="/reports/leads/export.xlsx" params={params} testId="report-excel" />
      </div>
      <PeriodFilters
        branches={branches}
        branchId={filters.branchId}
        year={report.year}
        month={report.month}
      >
        <OptionSelect
          label={tf("source")}
          value={filters.sourceId}
          onChange={(v) => set({ sourceId: v })}
          options={report.sources}
          testId="filter-source"
        />
      </PeriodFilters>
      <KpiCards items={kpis} columns={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("funnelTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars
              items={report.funnel.map((f) => ({ label: t(`funnel.${f.stage}`), value: f.count }))}
              emptyLabel={t("noData")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("byMonthTitle", { year: report.year })}</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiBars
              labels={monthLabels}
              series={[
                { name: t("series.created"), values: report.byMonth.map((m) => m.created) },
                { name: t("series.converted"), values: report.byMonth.map((m) => m.converted) },
                { name: t("series.lost"), values: report.byMonth.map((m) => m.lost) },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("byCourseTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars items={report.byCourse} emptyLabel={t("noData")} colored />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bySourceTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <HBars items={report.bySource} emptyLabel={t("noData")} colored />
          </CardContent>
        </Card>
      </div>
      <Card data-testid="report-trials">
        <CardHeader>
          <CardTitle className="text-base">{t("trialsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("trialsHint")}</p>
        </CardHeader>
        <CardContent>
          {report.trialsBySource.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("trialsEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("trialsColumns.source")}</TableHead>
                  <TableHead className="text-right">{t("trialsColumns.leads")}</TableHead>
                  <TableHead className="text-right">{t("trialsColumns.trials")}</TableHead>
                  <TableHead className="text-right">{t("trialsColumns.attended")}</TableHead>
                  <TableHead className="text-right">{t("trialsColumns.converted")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.trialsBySource.map((r) => (
                  <TableRow key={r.name ?? ""} data-testid="report-trials-row">
                    <TableCell className="font-medium">
                      {r.name ?? t("trialsColumns.noSource")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.trials}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.attended}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.converted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
