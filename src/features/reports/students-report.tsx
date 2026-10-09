"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { ExcelLink } from "@/features/shared/excel-link";
import type { StudentsReportFilters, StudentsReportTab } from "@/lib/validation/reports";
import type { StudentsReportDto } from "@/server/services/reports/students-report.service";

import { KpiCards } from "./kpi-cards";
import { FilterField, OptionSelect, PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "O'quvchilar hisoboti" (EXP §10): KPIs, DAVOMATLAR HISOBOTI and O'ZLASHTIRISH DARAJASI tabs. */
export function StudentsReport({
  report,
  filters,
  tab,
  branches,
  year,
  month,
}: {
  report: StudentsReportDto;
  filters: StudentsReportFilters;
  tab: StudentsReportTab;
  branches: Array<{ id: string; name: string }>;
  year: number;
  month: number;
}) {
  const t = useTranslations("reports.students");
  const tf = useTranslations("reports.filters");
  const tg = useTranslations("groups.statuses");
  const { params, set } = useReportParams();
  const k = report.kpis;
  const kpis = [
    { key: "total", label: t("kpis.total"), value: String(k.total) },
    { key: "newInPeriod", label: t("kpis.newInPeriod"), value: String(k.newInPeriod) },
    { key: "multiCourse", label: t("kpis.multiCourse"), value: String(k.multiCourse) },
    {
      key: "attendance",
      label: t("kpis.attendance"),
      value: k.attendancePercent === null ? "—" : `${k.attendancePercent}%`,
    },
    {
      key: "gradeAverage",
      label: t("kpis.gradeAverage"),
      value: k.gradeAverage === null ? "—" : String(k.gradeAverage),
    },
    { key: "appUsage", label: t("kpis.appUsage"), value: "—", hint: t("kpis.noApp") },
  ];
  const totals = report.attendance.totals;
  const statuses = ["ACTIVE", "TRIAL", "FROZEN", "ARCHIVED", "ALL"].map((s) => ({
    id: s,
    name: s === "ALL" ? tf("all") : tg(s),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ExcelLink
          path="/reports/students/export.xlsx"
          params={{ ...Object.fromEntries(params), tab }}
          testId="report-excel"
        />
      </div>
      <PeriodFilters branches={branches} branchId={filters.branchId} year={year} month={month}>
        <FilterField label={tf("from")} className="min-w-36 space-y-1">
          <Input
            type="date"
            value={report.from}
            onChange={(e) => set({ from: e.target.value })}
            data-testid="students-from"
          />
        </FilterField>
        <FilterField label={tf("to")} className="min-w-36 space-y-1">
          <Input
            type="date"
            value={report.to}
            onChange={(e) => set({ to: e.target.value })}
            data-testid="students-to"
          />
        </FilterField>
      </PeriodFilters>
      <KpiCards items={kpis} columns={6} />

      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "attendance" ? null : v })}>
        <TabsList>
          <TabsTrigger value="attendance" data-testid="students-tab-attendance">
            {t("tabs.attendance")}
          </TabsTrigger>
          <TabsTrigger value="performance" data-testid="students-tab-performance">
            {t("tabs.performance")}
          </TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-end gap-3 pt-3">
          <OptionSelect
            label={tf("group")}
            value={filters.groupId}
            onChange={(v) => set({ groupId: v })}
            options={report.options.groups}
            testId="filter-group"
          />
          <OptionSelect
            label={tf("teacher")}
            value={filters.teacherId}
            onChange={(v) => set({ teacherId: v })}
            options={report.options.teachers.map((x) => ({ id: x.id, name: x.fullName }))}
          />
          <OptionSelect
            label={tf("status")}
            value={filters.status}
            onChange={(v) => set({ status: v })}
            options={statuses}
            allLabel={t("notArchived")}
          />
        </div>
        <TabsContent value="attendance" className="space-y-3 pt-3">
          <div className="flex flex-wrap gap-4 text-sm" data-testid="attendance-totals">
            <span>
              {t("totals.expected")}: <b className="tabular-nums">{totals.expected}</b>
            </span>
            <span>
              {t("totals.present")}:{" "}
              <b className="tabular-nums text-emerald-700 dark:text-emerald-300">
                {totals.present}
              </b>
            </span>
            <span>
              {t("totals.absent")}: <b className="tabular-nums text-destructive">{totals.absent}</b>
            </span>
            <span>
              {t("totals.unmarked")}: <b className="tabular-nums">{totals.unmarked}</b>
            </span>
          </div>
          {report.attendance.rows.length === 0 ? (
            <EmptyState title={t("empty")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead>{t("columns.group")}</TableHead>
                    <TableHead>{t("columns.teacher")}</TableHead>
                    <TableHead className="text-right">{t("columns.students")}</TableHead>
                    <TableHead className="text-right">{t("columns.lessons")}</TableHead>
                    <TableHead className="text-right">{t("columns.unmarked")}</TableHead>
                    <TableHead className="text-right">{t("columns.absent")}</TableHead>
                    <TableHead className="text-right">{t("columns.present")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.attendance.rows.map((r, i) => (
                    <TableRow key={r.groupId} data-testid="attendance-report-row">
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/groups/${r.groupId}`} className="hover:underline">
                          {r.groupName}
                        </Link>
                      </TableCell>
                      <TableCell>{r.teacherName ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.students}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.lessons}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.unmarked}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {r.absent}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {r.present}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="performance" className="space-y-3 pt-3">
          {report.performance.rows.length === 0 ? (
            <EmptyState title={t("empty")} />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.student")}</TableHead>
                    <TableHead>{t("columns.groups")}</TableHead>
                    <TableHead>{t("columns.teachers")}</TableHead>
                    <TableHead>{t("columns.courses")}</TableHead>
                    <TableHead>{t("columns.grades")}</TableHead>
                    <TableHead className="text-right">{t("columns.average")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.performance.rows.map((r) => (
                    <TableRow key={r.studentId} data-testid="performance-row">
                      <TableCell className="font-medium">
                        <Link href={`/students/${r.studentId}`} className="hover:underline">
                          {r.fullName}
                        </Link>
                      </TableCell>
                      <TableCell>{r.groups.join(", ")}</TableCell>
                      <TableCell>{r.teachers.join(", ") || "—"}</TableCell>
                      <TableCell>{r.courses.join(", ")}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.grades.map((g) => `${g.groupName}: ${g.average ?? "—"}`).join("; ")}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {r.average ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination
            page={report.performance.page}
            pageSize={report.performance.pageSize}
            total={report.performance.total}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
