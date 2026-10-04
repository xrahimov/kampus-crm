"use client";

import { DoorOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { ExcelLink } from "@/features/shared/excel-link";
import { cn } from "@/lib/utils";
import { useMoneyFormat } from "@/lib/use-money-format";
import { STATISTICS_VIEWS, type StatisticsFilters } from "@/lib/validation/reports";
import type { StatisticsReportDto } from "@/server/services/reports/statistics.service";

import { KpiCards } from "./kpi-cards";
import { FilterField, PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "Markaz Faoliyati Statistikasi" (EXP §10): utilisation KPIs and the room × group table. */
export function StatisticsReport({
  report,
  filters,
  branches,
  canEditRooms,
}: {
  report: StatisticsReportDto;
  filters: StatisticsFilters;
  branches: Array<{ id: string; name: string }>;
  canEditRooms: boolean;
}) {
  const t = useTranslations("reports.statistics");
  const tf = useTranslations("reports.filters");
  const money = useMoneyFormat();
  const { params, set } = useReportParams();
  const k = report.kpis;
  const kpis = [
    { key: "utilisation", label: t("kpis.utilisation"), value: `${k.utilisation}%` },
    { key: "freeHours", label: t("kpis.freeHours"), value: t("hours", { count: k.freeHours }) },
    { key: "students", label: t("kpis.students"), value: String(k.students) },
    {
      key: "potentialRevenue",
      label: t("kpis.potentialRevenue"),
      value: money(k.potentialRevenue),
      hint: t("kpis.perMonth"),
    },
    { key: "freeSeats", label: t("kpis.freeSeats"), value: String(k.freeSeats) },
    {
      key: "possibleStudents",
      label: t("kpis.possibleStudents"),
      value: String(k.possibleStudents),
    },
  ];
  const num = (v: number | null) => (v === null ? "—" : String(v));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("period", {
              from: report.from,
              to: report.to,
              start: report.workHours.start,
              end: report.workHours.end,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditRooms && (
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/rooms" data-testid="update-capacities">
                <DoorOpen /> {t("updateCapacities")}
              </Link>
            </Button>
          )}
          <ExcelLink path="/reports/statistics/export.xlsx" params={params} testId="report-excel" />
        </div>
      </div>
      <PeriodFilters
        branches={branches}
        branchId={filters.branchId}
        year={report.year}
        month={report.month}
        withMonth={report.view === "monthly"}
      >
        {report.view !== "monthly" && (
          <FilterField label={tf("date")} className="min-w-36 space-y-1">
            <Input
              type="date"
              value={report.view === "daily" ? report.from : (filters.date ?? report.from)}
              onChange={(e) => set({ date: e.target.value })}
              data-testid="statistics-date"
            />
          </FilterField>
        )}
        <Tabs value={report.view} onValueChange={(v) => set({ view: v === "monthly" ? null : v })}>
          <TabsList>
            {STATISTICS_VIEWS.map((v) => (
              <TabsTrigger key={v} value={v} data-testid={`statistics-view-${v}`}>
                {t(`views.${v}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PeriodFilters>
      <KpiCards items={kpis} columns={6} />

      {report.rows.length === 0 ? (
        <EmptyState title={t("empty")} hint={t("emptyHint")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.room")}</TableHead>
                <TableHead className="text-right">{t("columns.capacity")}</TableHead>
                <TableHead className="text-right">{t("columns.roomHours")}</TableHead>
                <TableHead>{t("columns.group")}</TableHead>
                <TableHead className="text-right">{t("columns.students")}</TableHead>
                <TableHead className="text-right">{t("columns.freeSeats")}</TableHead>
                <TableHead className="text-right">{t("columns.lessonHours")}</TableHead>
                <TableHead className="text-right">{t("columns.price")}</TableHead>
                <TableHead className="text-right">{t("columns.totalSum")}</TableHead>
                <TableHead className="text-right">{t("columns.freeHours")}</TableHead>
                <TableHead className="text-right">{t("columns.seatHours")}</TableHead>
                <TableHead className="text-right">{t("columns.actualSeatHours")}</TableHead>
                <TableHead className="text-right">{t("columns.planSeatHours")}</TableHead>
                <TableHead className="text-right">{t("columns.fik")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((r) => (
                <TableRow
                  key={`${r.roomId}:${r.groupId ?? "total"}`}
                  className={cn(r.isRoomTotal && "bg-muted/50 font-medium")}
                  data-testid={r.isRoomTotal ? "room-total-row" : "room-group-row"}
                >
                  <TableCell>{r.roomName}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.capacity}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.roomHours}</TableCell>
                  <TableCell>
                    {r.groupName ?? <span className="text-muted-foreground">{t("roomTotal")}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.students}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.freeSeats}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.lessonHours}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.coursePrice === null ? "—" : money(r.coursePrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.totalSum)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(r.freeHours)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.seatHours}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.actualSeatHours}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.planSeatHours}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.fik}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
