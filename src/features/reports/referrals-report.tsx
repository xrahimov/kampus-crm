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
import { useMoneyFormat } from "@/lib/use-money-format";
import type { ReferralsReportFilters } from "@/lib/validation/reports";
import type { ReferralsReportDto } from "@/server/services/students/referrals.service";

import { MultiBars } from "./charts";
import { KpiCards } from "./kpi-cards";
import { PeriodFilters, useReportParams } from "./report-filters";

/** Reports → Referral programme (A-120): who brought whom this month and what it earned them. */
export function ReferralsReport({
  report,
  filters,
  branches,
}: {
  report: ReferralsReportDto;
  filters: ReferralsReportFilters;
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("reports.referrals");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const { params } = useReportParams();
  const k = report.kpis;
  const kpis = [
    { key: "leads", label: t("kpis.leads"), value: String(k.leads) },
    { key: "joined", label: t("kpis.joined"), value: String(k.joined) },
    { key: "coins", label: t("kpis.coins"), value: String(k.coins) },
    { key: "bonus", label: t("kpis.bonus"), value: money(k.bonus) },
  ];
  const monthLabels = report.byMonth.map((m) =>
    fmt(parseDateOnly(`${m.month}-01`), { month: "short" }),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ExcelLink path="/reports/referrals/export.xlsx" params={params} testId="report-excel" />
      </div>
      <PeriodFilters
        branches={branches}
        branchId={filters.branchId}
        year={report.year}
        month={report.month}
      />
      <KpiCards items={kpis} columns={4} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("byMonthTitle", { year: report.year })}</CardTitle>
        </CardHeader>
        <CardContent>
          <MultiBars
            labels={monthLabels}
            series={[
              { name: t("series.leads"), values: report.byMonth.map((m) => m.leads) },
              { name: t("series.joined"), values: report.byMonth.map((m) => m.joined) },
            ]}
          />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("referrersTitle")}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t("kpis.referrers")}: {k.referrers}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noData")}</p>
            ) : (
              <Table data-testid="referrers-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.student")}</TableHead>
                    <TableHead className="text-right">{t("columns.leads")}</TableHead>
                    <TableHead className="text-right">{t("columns.joined")}</TableHead>
                    <TableHead className="text-right">{t("columns.coins")}</TableHead>
                    <TableHead className="text-right">{t("columns.bonus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((r) => (
                    <TableRow key={r.studentId} data-testid="referrer-row">
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.joined}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.coins}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.bonus > 0 ? money(r.bonus) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("referredTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {report.referred.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noData")}</p>
            ) : (
              <Table data-testid="referred-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.who")}</TableHead>
                    <TableHead>{t("columns.invitedBy")}</TableHead>
                    <TableHead>{t("columns.date")}</TableHead>
                    <TableHead>{t("columns.state")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.referred.map((r) => (
                    <TableRow key={`${r.joined ? "s" : "l"}-${r.id}`} data-testid="referred-row">
                      <TableCell>
                        <div className="font-medium">{r.fullName}</div>
                        {r.phone && (
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {r.phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{r.referrerName}</TableCell>
                      <TableCell className="tabular-nums">
                        {fmt(new Date(r.createdAt), { dateStyle: "medium" })}
                      </TableCell>
                      <TableCell>
                        {r.joined
                          ? t("state.joined", {
                              date: r.joinedAt
                                ? fmt(parseDateOnly(r.joinedAt), { dateStyle: "medium" })
                                : "",
                            })
                          : t("state.lead")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
