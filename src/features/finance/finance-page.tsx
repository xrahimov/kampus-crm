"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NameDialog } from "@/features/leads/name-dialog";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { FinanceKind } from "@/lib/validation/finance";
import type { FinanceCategoryDto } from "@/server/services/finance/categories.service";
import type { FinanceOptions } from "@/server/services/finance/entries.service";
import type {
  FinanceOverviewDto,
  FinancePlanDto,
} from "@/server/services/finance/overview.service";
import type { PayrollSummaryDto } from "@/server/services/finance/payroll.service";

import { Donut, YearBars } from "./charts";

const ALL = "ALL";

export interface FinanceFilters {
  branchId: string | null;
  year: number;
  month: number | null;
  paymentMethodId: string | null;
  effective: boolean;
}

/** EXP §9 "/finance": filters, "Umumiy raqamlar", charts, plan, categories, bonuses/fines, payroll history. */
export function FinancePage({
  filters,
  overview,
  plan,
  categories,
  staffTotals,
  payroll,
  cashCloses,
  options,
  branches,
  years,
  can,
}: {
  filters: FinanceFilters;
  overview: FinanceOverviewDto;
  plan: FinancePlanDto;
  categories: FinanceCategoryDto[];
  staffTotals: {
    bonus: number;
    penalty: number;
    advance: number;
    marketing: number;
    investment: number;
  };
  payroll: PayrollSummaryDto[];
  /** Cashier day closes in the period and how many still wait for the hand-over (A-122). */
  cashCloses: { count: number; pending: number };
  options: FinanceOptions;
  branches: BranchOption[];
  years: number[];
  can: { create: boolean };
}) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [newCategory, setNewCategory] = useState<FinanceKind | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  const monthLabel = (m: number) =>
    fmt(parseDateOnly(`${filters.year}-${String(m).padStart(2, "0")}-01`), {
      month: "short",
      year: "numeric",
    });
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    fmt(parseDateOnly(`2026-${String(i + 1).padStart(2, "0")}-01`), {
      month: "short",
      year: "numeric",
    }).replace(/[\s,]*2026[\s,]*/g, ""),
  );

  const kpis: Array<{ key: string; value: string; href?: string; testId?: string }> = [
    { key: "income", value: money(overview.income), href: "#tushumlar" },
    { key: "expenses", value: money(overview.expenses), href: "#chiqimlar" },
    { key: "profit", value: money(overview.profit) },
    { key: "activeBalance", value: money(overview.activeBalance), href: "/finance/investment" },
    { key: "ltv", value: money(overview.ltv) },
    { key: "cac", value: money(overview.cac) },
    { key: "marketingEfficiency", value: `${overview.marketingEfficiency}%` },
    { key: "averagePayment", value: money(overview.averagePayment) },
  ];

  const categoryCards = (kind: FinanceKind, anchor: string) => (
    <section id={anchor} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {t(kind === "EXPENSE" ? "expenseReport" : "incomeReport")}
        </h2>
        {can.create && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNewCategory(kind)}
            data-testid={`add-${kind}`}
          >
            <Plus /> {t("addCategory")}
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kind === "EXPENSE" && (
          <>
            <LinkCard
              href="/finance/advance"
              title={t("sections.advance")}
              value={money(staffTotals.advance)}
            />
            <LinkCard
              href="/finance/marketing"
              title={t("sections.marketing")}
              value={money(staffTotals.marketing)}
            />
          </>
        )}
        {categories
          .filter((c) => c.kind === kind)
          .map((c) => (
            <LinkCard
              key={c.id}
              href={`/finance/costs/${c.id}`}
              title={c.name}
              value={money(c.total)}
              testId="category-card"
            />
          ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {branches.length > 1 && (
          <Select value={filters.branchId ?? ALL} onValueChange={(v) => setParams({ branchId: v })}>
            <SelectTrigger className="w-44" aria-label={t("filters.branch")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{tc("allBranches")}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={String(filters.year)} onValueChange={(v) => setParams({ year: v })}>
          <SelectTrigger className="w-28" aria-label={t("filters.year")} data-testid="filter-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.month ? String(filters.month) : ALL}
          onValueChange={(v) => setParams({ month: v })}
        >
          <SelectTrigger
            className="w-36"
            aria-label={t("filters.month")}
            data-testid="filter-month"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.wholeYear")}</SelectItem>
            {monthNames.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.paymentMethodId ?? ALL}
          onValueChange={(v) => setParams({ paymentMethodId: v })}
        >
          <SelectTrigger className="w-36" aria-label={t("filters.method")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.anyMethod")}</SelectItem>
            {options.paymentMethods.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("overview")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.key} data-testid={`kpi-${k.key}`}>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">{t(`kpis.${k.key}`)}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {k.href ? (
                    <Link href={k.href} className="hover:underline">
                      {k.value}
                    </Link>
                  ) : (
                    k.value
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("byMethod")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Donut
                slices={overview.byMethod.map((m) => ({
                  label: m.name ?? t("noMethod"),
                  value: m.amount,
                }))}
                format={money}
                emptyLabel={tc("nothingFound")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("yearly", { year: filters.year })}</CardTitle>
            </CardHeader>
            <CardContent>
              <YearBars
                months={overview.yearly}
                labels={monthNames}
                format={money}
                legend={{ income: t("kpis.income"), expenses: t("kpis.expenses") }}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3" data-testid="plan">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {t("planTitle", { month: monthLabel(filters.month ?? new Date().getMonth() + 1) })}
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={filters.effective}
              onCheckedChange={(v) => setParams({ effective: v ? null : "0" })}
              aria-label={t("effectiveTime")}
            />
            {t("effectiveTime")}
          </label>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">{t("plan.achieved")}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {money(plan.achieved)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("plan.done", { percent: plan.achievedPercent })}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{t("plan.expected")}</div>
                <div className="text-xl font-semibold tabular-nums">
                  {money(plan.expected)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("plan.left", {
                      percent: Math.max(0, Math.round((100 - plan.achievedPercent) * 10) / 10),
                    })}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                {t("plan.progress")}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, plan.achievedPercent)}%` }}
                  role="progressbar"
                  aria-valuenow={plan.achievedPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["monthlyPlan", money(plan.plan)],
                  ["activeDebt", `${money(plan.activeDebt)} · ${plan.debtors}`],
                  ["prepayments", money(plan.prepayments)],
                  ["currentShare", `${plan.achievedPercent}%`],
                ] as Array<[string, string]>
              ).map(([key, value]) => (
                <div key={key} className="rounded-md border p-3">
                  <div className="text-sm text-muted-foreground">{t(`plan.${key}`)}</div>
                  <div className="font-semibold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {categoryCards("EXPENSE", "chiqimlar")}
      {categoryCards("INCOME", "tushumlar")}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("staffMoney")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LinkCard
            href="/finance/bonus"
            title={t("sections.bonus")}
            value={money(staffTotals.bonus)}
          />
          <LinkCard
            href="/finance/penalty"
            title={t("sections.penalty")}
            value={money(staffTotals.penalty)}
          />
          <LinkCard
            href="/cashdesk"
            title={t("sections.cashdesk")}
            value={
              cashCloses.pending > 0
                ? `${t("cashdeskCount", { count: cashCloses.count })} · ${t("cashdeskPending", { count: cashCloses.pending })}`
                : t("cashdeskCount", { count: cashCloses.count })
            }
            testId="cashdesk-card"
          />
        </div>
      </section>

      <section className="space-y-3" data-testid="payroll-history">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("payroll.title")}</h2>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/finance/salary-detail/${filters.year}-${String(filters.month ?? new Date().getMonth() + 1).padStart(2, "0")}-01`}
            >
              {t("payroll.open", { month: monthLabel(filters.month ?? new Date().getMonth() + 1) })}
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("payroll.rulesNote")}</p>
        <Card>
          {payroll.length === 0 ? (
            <EmptyState title={t("payroll.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payroll.columns.month")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.staff")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.fixed")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.percent")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.perLesson")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.perStudent")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.bonus")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.penalty")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.advance")}</TableHead>
                    <TableHead className="text-right">{t("payroll.columns.total")}</TableHead>
                    <TableHead>{tc("status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payroll.map((run) => (
                    <TableRow key={run.id} data-testid="payroll-row">
                      <TableCell className="font-medium">
                        <Link
                          href={`/finance/salary-detail/${run.month}-01`}
                          className="hover:underline"
                        >
                          {fmt(parseDateOnly(`${run.month}-01`), {
                            month: "short",
                            year: "numeric",
                          })}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{run.staffCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.fixed)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.percent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.perLesson)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.perStudent)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.bonus)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.penalty)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(run.totals.advance)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(run.totals.net)}
                      </TableCell>
                      <TableCell>
                        {t(`payroll.statuses.${run.status}`)} · {run.approvedCount}/{run.staffCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </section>

      <NameDialog
        open={newCategory !== null}
        onOpenChange={(open) => !open && setNewCategory(null)}
        title={t("categoryDialog")}
        label={t("categoryName")}
        initial=""
        testId="category-dialog"
        onSubmit={async (name) => {
          await api("/finance/categories", { method: "POST", body: { kind: newCategory, name } });
          setNewCategory(null);
          refresh();
        }}
      />
    </div>
  );
}

function LinkCard({
  href,
  title,
  value,
  testId,
}: {
  href: string;
  title: string;
  value: string;
  testId?: string;
}) {
  return (
    <Link href={href} className="block" data-testid={testId}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
