"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { ExcelLink } from "@/features/shared/excel-link";
import type { Page } from "@/lib/validation/common";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { StudentPaymentsFilters } from "@/lib/validation/reports";
import type {
  StudentPaymentRowDto,
  StudentPaymentsOptions,
} from "@/server/services/reports/student-payments.service";

import { FilterField, OptionSelect, PeriodFilters, useReportParams } from "./report-filters";

/** Reports → "O'quvchilar to'lovlari" (EXP §10): count + sum header, the by-payment-date switch, filters, EXCEL. */
export function StudentPaymentsReport({
  page,
  filters,
  options,
  branches,
  year,
  month,
}: {
  page: Page<StudentPaymentRowDto> & { totalAmount: number };
  filters: StudentPaymentsFilters & { q?: string };
  options: StudentPaymentsOptions;
  branches: Array<{ id: string; name: string }>;
  year: number;
  month: number;
}) {
  const t = useTranslations("reports.studentPayments");
  const tf = useTranslations("reports.filters");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const { params, set } = useReportParams();
  const [q, setQ] = useState(filters.q ?? "");
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const named = <T extends { id: string }>(xs: T[], label: (x: T) => string) =>
    xs.map((x) => ({ id: x.id, name: label(x) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="student-payments-summary">
            {t("summary", { count: page.total, amount: money(page.totalAmount) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="by-paid-at"
              checked={!!filters.byPaidAt}
              onCheckedChange={(v) => set({ byPaidAt: v ? "true" : null })}
              data-testid="by-paid-at"
            />
            <Label htmlFor="by-paid-at">{t("byPaidAt")}</Label>
          </div>
          <ExcelLink
            path="/reports/student-payments/export.xlsx"
            params={params}
            testId="report-excel"
          />
        </div>
      </div>
      <PeriodFilters branches={branches} branchId={filters.branchId} year={year} month={month}>
        <FilterField label={tf("search")} className="min-w-48 space-y-1">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") set({ q: q.trim() || null });
            }}
            onBlur={() => set({ q: q.trim() || null })}
            placeholder={tf("searchStudent")}
            data-testid="student-payments-search"
          />
        </FilterField>
        <OptionSelect
          label={tf("group")}
          value={filters.groupId}
          onChange={(v) => set({ groupId: v })}
          options={options.groups}
          testId="filter-group"
        />
        <OptionSelect
          label={tf("method")}
          value={filters.paymentMethodId}
          onChange={(v) => set({ paymentMethodId: v })}
          options={options.methods}
        />
        <OptionSelect
          label={tf("teacher")}
          value={filters.teacherId}
          onChange={(v) => set({ teacherId: v })}
          options={named(options.teachers, (x) => x.fullName)}
        />
        <OptionSelect
          label={tf("course")}
          value={filters.courseId}
          onChange={(v) => set({ courseId: v })}
          options={options.courses}
        />
        <OptionSelect
          label={t("bonus")}
          value={filters.bonus}
          onChange={(v) => set({ bonus: v })}
          options={[
            { id: "yes", name: t("withBonus") },
            { id: "no", name: t("withoutBonus") },
          ]}
        />
        <OptionSelect
          label={t("receivedBy")}
          value={filters.receivedById}
          onChange={(v) => set({ receivedById: v })}
          options={named(options.staff, (x) => x.fullName)}
        />
      </PeriodFilters>

      {page.items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>{t("columns.student")}</TableHead>
                <TableHead>{t("columns.group")}</TableHead>
                <TableHead>{t("columns.teacher")}</TableHead>
                <TableHead className="text-right">{t("columns.amount")}</TableHead>
                <TableHead className="text-right">{t("columns.bonus")}</TableHead>
                <TableHead>{t("columns.paidAt")}</TableHead>
                <TableHead>{t("columns.effectiveMonth")}</TableHead>
                <TableHead>{t("columns.comment")}</TableHead>
                <TableHead>{t("columns.receivedBy")}</TableHead>
                <TableHead>{t("columns.method")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((p, i) => (
                <TableRow key={p.id} data-testid="student-payment-row">
                  <TableCell className="text-muted-foreground">
                    {(page.page - 1) * page.pageSize + i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/students/${p.studentId}`} className="hover:underline">
                      {p.studentName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/groups/${p.groupId}`} className="hover:underline">
                      {p.groupName}
                    </Link>
                  </TableCell>
                  <TableCell>{p.teacherName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(p.amount)}
                    {p.refunded > 0 && (
                      <span className="block text-xs text-destructive">−{money(p.refunded)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.bonus > 0 ? money(p.bonus) : "—"}
                  </TableCell>
                  <TableCell>{date(p.paidAt)}</TableCell>
                  <TableCell>
                    {fmt(parseDateOnly(`${p.effectiveMonth}-01`), {
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {p.comment ?? ""}
                  </TableCell>
                  <TableCell>{p.receivedByName ?? "—"}</TableCell>
                  <TableCell>{p.methodName ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
    </div>
  );
}
