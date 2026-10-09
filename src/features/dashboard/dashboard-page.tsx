"use client";

import { Eye, EyeOff, Gauge } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Donut, YearBars } from "@/features/finance/charts";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { DashboardFinanceOptions } from "@/server/services/dashboard/finance.service";
import type { DashboardKpisDto } from "@/server/services/dashboard/kpis.service";
import type { ScheduleDto } from "@/server/services/dashboard/schedule.service";
import type { FinanceOverviewDto } from "@/server/services/finance/overview.service";

import { ScheduleGrid } from "./schedule-grid";

const ALL = "__all";

export interface DashboardFilters {
  branchId?: string;
  year: number;
  month?: number;
  paymentMethodId?: string;
}

/** EXP §1: KPI cards behind "Raqamlarni ko'rish", the weekly room schedule and the finance summary. */
export function DashboardPage({
  userName,
  kpis,
  schedule,
  finance,
  financeOptions,
  filters,
  branches,
  canReports,
}: {
  userName: string;
  kpis: DashboardKpisDto;
  schedule: ScheduleDto;
  finance: FinanceOverviewDto | null;
  financeOptions: DashboardFinanceOptions | null;
  filters: DashboardFilters;
  branches: Array<{ id: string; name: string }>;
  canReports: boolean;
}) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tf = useTranslations("finance");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [shown, setShown] = useState(false);

  function setParams(next: Record<string, string | number | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "" || v === ALL) params.delete(k);
      else params.set(k, String(v));
    }
    startTransition(() => router.replace(`${pathname}?${params.toString()}`));
  }

  const mask = (v: string) => (shown ? v : "***");
  const num = (v: number) => mask(String(v));
  const cards: Array<{ key: string; value: string; href: string; badge?: string }> = [
    { key: "activeLeads", value: num(kpis.activeLeads), href: "/leads" },
    { key: "groups", value: num(kpis.groups), href: "/groups" },
    {
      key: "remainingDebt",
      value: mask(money(kpis.remainingDebt)),
      href: "/students?paymentStatus=DEBTOR",
    },
    { key: "debtors", value: num(kpis.debtors), href: "/debts" },
    { key: "dueSoon", value: num(kpis.dueSoon), href: "/students?paymentStatus=DUE_SOON" },
    {
      key: "activeStudents",
      value: num(kpis.activeStudents),
      href: "/students?groupStatus=ACTIVE",
    },
    { key: "studentsInGroups", value: num(kpis.studentsInGroups), href: "/students" },
    { key: "trial", value: num(kpis.trial), href: "/students?groupStatus=TRIAL" },
    {
      key: "leftThisMonth",
      value: num(kpis.leftThisMonth),
      href: canReports ? "/reports/churn" : "/students?archived=true",
    },
    { key: "teachers", value: num(kpis.teachers), href: "/teachers" },
    { key: "exams", value: num(kpis.exams), href: "/exams" },
    {
      key: "newAdmissions",
      value: num(kpis.newAdmissions),
      href: "/students?groupStatus=NEW",
      badge: "NEW",
    },
  ];

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    fmt(parseDateOnly(`2026-${String(i + 1).padStart(2, "0")}-01`), { month: "short" }),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("welcome", { name: userName })}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {branches.length > 1 && (
            <Select
              value={filters.branchId ?? ALL}
              onValueChange={(v) => setParams({ branchId: v })}
            >
              <SelectTrigger
                className="w-44"
                aria-label={t("branch")}
                data-testid="dashboard-branch"
              >
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
          {kpis.utilisation !== null && (
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/statistics" data-testid="utilisation-badge">
                <Gauge /> {t("utilisation", { percent: mask(String(kpis.utilisation)) })}
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant={shown ? "outline" : "default"}
            onClick={() => setShown((v) => !v)}
            data-testid="show-numbers"
          >
            {shown ? <EyeOff /> : <Eye />} {shown ? t("hideNumbers") : t("showNumbers")}
          </Button>
        </div>
      </div>

      <div
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        data-testid="dashboard-kpis"
      >
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="group" data-testid={`dash-${c.key}`}>
            <Card className="transition-colors group-hover:border-primary/60">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  {t(`kpis.${c.key}`)}
                  {c.badge && <Badge variant="success">{c.badge}</Badge>}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums" data-testid="dash-value">
                  {c.value}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <ScheduleGrid schedule={schedule} onChange={(next) => setParams(next)} />

      {finance && financeOptions && (
        <section className="space-y-3" data-testid="dashboard-finance">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("finance.title")}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("finance.year")}</Label>
                <Select value={String(filters.year)} onValueChange={(v) => setParams({ year: v })}>
                  <SelectTrigger className="w-28" data-testid="finance-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {financeOptions.years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("finance.month")}</Label>
                <Select
                  value={filters.month ? String(filters.month) : ALL}
                  onValueChange={(v) => setParams({ month: v })}
                >
                  <SelectTrigger className="w-36" data-testid="finance-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("finance.wholeYear")}</SelectItem>
                    {monthNames.map((name, i) => (
                      <SelectItem key={name} value={String(i + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("finance.method")}</Label>
                <Select
                  value={filters.paymentMethodId ?? ALL}
                  onValueChange={(v) => setParams({ paymentMethodId: v })}
                >
                  <SelectTrigger className="w-36" data-testid="finance-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{tf("filters.anyMethod")}</SelectItem>
                    {financeOptions.paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["income", finance.income, "/finance"],
                ["expenses", finance.expenses, "/finance"],
                ["profit", finance.profit, "/finance"],
                ["activeBalance", finance.activeBalance, "/finance/investment"],
              ] as const
            ).map(([key, value, href]) => (
              <Card key={key} data-testid={`finance-${key}`}>
                <CardContent className="pt-5">
                  <div className="text-xs text-muted-foreground">{tf(`kpis.${key}`)}</div>
                  <Link
                    href={href}
                    className="mt-1 block text-xl font-semibold tabular-nums hover:underline"
                  >
                    {mask(money(value))}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tf("byMethod")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Donut
                  slices={finance.byMethod.map((m) => ({
                    label: m.name ?? tf("noMethod"),
                    value: m.amount,
                  }))}
                  format={(v) => mask(money(v))}
                  emptyLabel={tc("nothingFound")}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tf("yearly", { year: filters.year })}</CardTitle>
              </CardHeader>
              <CardContent>
                <YearBars
                  months={finance.yearly}
                  labels={monthNames}
                  format={(v) => mask(money(v))}
                  legend={{ income: tf("kpis.income"), expenses: tf("kpis.expenses") }}
                />
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}
