"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExcelLink } from "@/features/shared/excel-link";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { PaymentsReportTab } from "@/lib/validation/reports";
import type { PaymentsReportDto } from "@/server/services/reports/payments-report.service";

import { KpiCards } from "./kpi-cards";
import { PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "To'lovlar hisoboti" (EXP §10): six KPI cards, O'QITUVCHILAR / XODIMLAR tabs, EXCEL. */
export function PaymentsReport({
  report,
  tab,
  branches,
}: {
  report: PaymentsReportDto;
  tab: PaymentsReportTab;
  branches: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("reports.payments");
  const money = useMoneyFormat();
  const { params, set } = useReportParams();
  const k = report.kpis;
  const kpis = (
    [
      ["total", k.total, t("kpis.countPayments", { count: k.total.count })],
      ["onTime", k.onTime, t("kpis.countPayments", { count: k.onTime.count })],
      ["late", k.late, t("kpis.countPayments", { count: k.late.count })],
      ["discounts", k.discounts, t("kpis.countDiscounts", { count: k.discounts.count })],
      ["bonus", k.bonus, null],
      ["refunds", k.refunds, t("kpis.countRefunds", { count: k.refunds.count })],
    ] as const
  ).map(([key, kpi, hint]) => ({
    key,
    label: t(`kpis.${key}`),
    value: money(kpi.value),
    hint,
    change: kpi.change,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ExcelLink
          path="/reports/payments/export.xlsx"
          params={{ ...Object.fromEntries(params), tab }}
          testId="report-excel"
        />
      </div>
      <PeriodFilters
        branches={branches}
        branchId={report.branchId}
        year={report.year}
        month={report.month}
      />
      <KpiCards items={kpis} columns={6} />

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "teachers" ? null : v })}>
        <TabsList>
          <TabsTrigger value="teachers" data-testid="payments-tab-teachers">
            {t("tabs.teachers")}
          </TabsTrigger>
          <TabsTrigger value="staff" data-testid="payments-tab-staff">
            {t("tabs.staff")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="teachers" className="pt-3">
          {report.teachers.length === 0 ? (
            <EmptyState title={t("emptyTeachers")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>{t("columns.fullName")}</TableHead>
                    <TableHead className="text-right">{t("columns.groups")}</TableHead>
                    <TableHead>{t("columns.courses")}</TableHead>
                    <TableHead className="text-right">{t("columns.students")}</TableHead>
                    <TableHead className="text-right">{t("columns.total")}</TableHead>
                    <TableHead className="text-right">{t("columns.debt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.teachers.map((r, i) => (
                    <TableRow key={r.userId} data-testid="teacher-payment-row">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.groupsCount}</TableCell>
                      <TableCell>{r.courses.join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.studentsCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.totalPayments)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {r.debt > 0 ? money(r.debt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="staff" className="pt-3">
          {report.staff.length === 0 ? (
            <EmptyState title={t("emptyStaff")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>{t("columns.fullName")}</TableHead>
                    <TableHead>{t("columns.roles")}</TableHead>
                    <TableHead className="text-right">{t("columns.paymentsCount")}</TableHead>
                    <TableHead className="text-right">{t("columns.total")}</TableHead>
                    <TableHead className="text-right">{t("columns.refunds")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.staff.map((r, i) => (
                    <TableRow key={r.userId} data-testid="staff-payment-row">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.fullName}</TableCell>
                      <TableCell>{r.roles.join(", ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.paymentsCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(r.totalPayments)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.refunds > 0 ? money(r.refunds) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
