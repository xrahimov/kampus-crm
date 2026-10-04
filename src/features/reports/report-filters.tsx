"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";

export const ALL = "__all";

/** URL-backed filters shared by the report pages: read the query, replace keys in place. */
export function useReportParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  function set(entries: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }
  return { params: searchParams, set, pending };
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "min-w-36 space-y-1"}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** A select over `{id, name}` options with an "All" first row. */
export function OptionSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  testId,
  className,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  allLabel?: string;
  testId?: string;
  className?: string;
}) {
  const t = useTranslations("reports.filters");
  return (
    <FilterField label={label} className={className}>
      <Select value={value ?? ALL} onValueChange={onChange}>
        <SelectTrigger data-testid={testId} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel ?? t("all")}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

/** Branch / year / month row (EXP §10: every report starts with it). */
export function PeriodFilters({
  branches,
  branchId,
  year,
  month,
  withMonth = true,
  children,
}: {
  branches: Array<{ id: string; name: string }>;
  branchId: string | null | undefined;
  year: number;
  month?: number | null;
  withMonth?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("reports.filters");
  const fmt = useDateFormat();
  const { set } = useReportParams();
  const years = Array.from({ length: 5 }, (_, i) => year - 3 + i);
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="report-filters">
      {branches.length > 1 && (
        <OptionSelect
          label={t("branch")}
          value={branchId}
          onChange={(v) => set({ branchId: v })}
          options={branches}
          allLabel={t("allBranches")}
          testId="report-branch"
        />
      )}
      <FilterField label={t("year")} className="min-w-24 space-y-1">
        <Select value={String(year)} onValueChange={(v) => set({ year: v })}>
          <SelectTrigger data-testid="report-year" aria-label={t("year")}>
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
      </FilterField>
      {withMonth && (
        <FilterField label={t("month")} className="min-w-32 space-y-1">
          <Select
            value={String(month ?? new Date().getMonth() + 1)}
            onValueChange={(v) => set({ month: v })}
          >
            <SelectTrigger data-testid="report-month" aria-label={t("month")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {fmt(new Date(Date.UTC(year, m - 1, 1)), { month: "short", year: "numeric" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      )}
      {children}
    </div>
  );
}
