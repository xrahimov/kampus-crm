"use client";

import { CheckCheck, Printer, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { CashCloseDto, CashCloseListDto } from "@/server/services/finance/cash-close.service";

import { CloseDayDialog } from "./close-day-dialog";

const ALL = "ALL";

/** "/cashdesk": the day closes of the cashiers in scope, and the "Close the day" button (A-122). */
export function CashDeskPage({
  list,
  filters,
  branches,
  activeBranchId,
  years,
  today,
  can,
}: {
  list: CashCloseListDto;
  filters: { branchId: string | null; year: number; month: number | null };
  branches: BranchOption[];
  activeBranchId: string | null;
  years: number[];
  /** Today's date in Tashkent, "YYYY-MM-DD". */
  today: string;
  can: { close: boolean; accept: boolean; seeAll: boolean };
}) {
  const t = useTranslations("cashdesk");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    fmt(parseDateOnly(`2026-${String(i + 1).padStart(2, "0")}-01`), {
      month: "short",
      year: "numeric",
    }).replace(/[\s,]*2026[\s,]*/g, ""),
  );
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const signed = (v: number) => (
    <span className={v < 0 ? "text-destructive" : v > 0 ? "text-success" : undefined}>
      {v > 0 ? `+${money(v)}` : money(v)}
    </span>
  );

  async function accept(close: CashCloseDto) {
    setAccepting(close.id);
    setError(null);
    try {
      await api(`/cashdesk/${close.id}/accept`, { method: "POST" });
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setAccepting(null);
    }
  }

  const showBranchFilter = !activeBranchId && branches.length > 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {can.close && (
          <Button onClick={() => setOpen(true)} data-testid="close-day">
            <Wallet /> {t("closeDay")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {showBranchFilter && (
          <Select value={filters.branchId ?? ALL} onValueChange={(v) => setParam("branchId", v)}>
            <SelectTrigger className="w-44" aria-label={t("columns.branch")}>
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
        <Select value={String(filters.year)} onValueChange={(v) => setParam("year", v)}>
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
          value={filters.month ? String(filters.month) : "all"}
          onValueChange={(v) => setParam("month", v)}
        >
          <SelectTrigger
            className="w-36"
            aria-label={t("filters.month")}
            data-testid="filter-month"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.wholeYear")}</SelectItem>
            {monthNames.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <Alert variant="destructive">{t.has(error) ? t(error) : tc("retry")}</Alert>}

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={t("empty")} hint={can.close ? t("emptyHint") : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.branch")}</TableHead>
                  {can.seeAll && <TableHead>{t("columns.cashier")}</TableHead>}
                  <TableHead className="text-right">{t("columns.payments")}</TableHead>
                  <TableHead className="text-right">{t("columns.expectedCash")}</TableHead>
                  <TableHead className="text-right">{t("columns.countedCash")}</TableHead>
                  <TableHead className="text-right">{t("columns.difference")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((c) => (
                  <TableRow key={c.id} data-testid="cash-close-row">
                    <TableCell className="font-medium whitespace-nowrap">{date(c.date)}</TableCell>
                    <TableCell>{c.branchName}</TableCell>
                    {can.seeAll && <TableCell>{c.cashierName}</TableCell>}
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {money(c.received)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {t("paymentsCount", { count: c.paymentsCount })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c.expectedCash)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(c.countedCash)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums" data-testid="row-difference">
                      {signed(c.difference)}
                    </TableCell>
                    <TableCell>
                      {c.acceptedAt ? (
                        <Badge variant="success" title={c.acceptedByName ?? undefined}>
                          {c.acceptedByName
                            ? t("acceptedBy", { name: c.acceptedByName })
                            : t("status.accepted")}
                        </Badge>
                      ) : (
                        <Badge variant="muted">{t("status.pending")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <Button asChild variant="ghost" size="sm" data-testid="print-close">
                          <Link href={`/cashdesk/${c.id}`} target="_blank" rel="noreferrer">
                            <Printer /> {t("print")}
                          </Link>
                        </Button>
                        {can.accept && !c.acceptedAt && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={accepting === c.id}
                            onClick={() => accept(c)}
                            data-testid="accept-close"
                          >
                            <CheckCheck /> {t("accept")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell colSpan={can.seeAll ? 4 : 3}>{t("totals")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(list.totals.expectedCash)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(list.totals.countedCash)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="totals-difference">
                    {signed(list.totals.difference)}
                  </TableCell>
                  <TableCell colSpan={2} className="text-sm text-muted-foreground">
                    {list.totals.pending > 0 && t("pendingCount", { count: list.totals.pending })}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <CloseDayDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
        defaultBranchId={activeBranchId ?? filters.branchId ?? branches[0]?.id ?? ""}
        today={today}
        onSaved={refresh}
      />
    </div>
  );
}
