"use client";

import { MoreHorizontal, Phone, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
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
import { ExcelLink } from "@/features/shared/excel-link";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import { DEBT_LIST_FILTERS, type DebtFilters } from "@/lib/validation/debts";
import type { DebtCaseDto, DebtListDto } from "@/server/services/debts/debts.service";

import { ContactDialog, type ContactTarget } from "./contact-dialog";
import { HistoryDialog } from "./history-dialog";

const ALL = "__all";

/** "/debts" (A-112): who owes what for how long, what they promised and who last called. */
export function DebtsPage({
  list,
  filters,
  branches,
}: {
  list: DebtListDto;
  filters: DebtFilters;
  /** Branches to filter by; empty when the header already pins one branch. */
  branches: BranchOption[];
}) {
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const tAll = useTranslations();
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [contacting, setContacting] = useState<ContactTarget | null>(null);
  const [history, setHistory] = useState<DebtCaseDto | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function remind(item: DebtCaseDto) {
    setBusyId(item.id);
    setNotice(null);
    try {
      const r = await api<{ queued: number }>(`/debts/${item.id}/remind`, { method: "POST" });
      setNotice(
        r.queued > 0
          ? { kind: "ok", text: t("remind.sent", { count: r.queued }) }
          : { kind: "error", text: t("remind.none") },
      );
      if (r.queued > 0) refresh();
    } catch (e) {
      const key = e instanceof ApiError ? e.message : "errors.internal";
      setNotice({ kind: "error", text: tAll.has(key) ? tAll(key) : tAll("errors.internal") });
    } finally {
      setBusyId(null);
    }
  }

  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const status = filters.status ?? "ACTIVE";
  const summary: Array<{ key: keyof DebtListDto["summary"]; value: string }> = [
    { key: "debtors", value: String(list.summary.debtors) },
    { key: "amount", value: money(list.summary.amount) },
    { key: "promised", value: String(list.summary.promised) },
    { key: "needsCall", value: String(list.summary.needsCall) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="debts-count">
            {t("count", { count: list.total })}
          </p>
        </div>
        <ExcelLink path="/debts/export.xlsx" params={searchParams} testId="debts-excel" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.key} data-testid={`debts-summary-${s.key}`}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {t(`summary.${s.key}`)}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.status")}</Label>
          <Select
            value={status}
            onValueChange={(v) => setParam("status", v === "ACTIVE" ? null : v)}
          >
            <SelectTrigger data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEBT_LIST_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {t(`filters.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {branches.length > 1 && (
          <div className="min-w-44 space-y-1">
            <Label className="text-xs text-muted-foreground">{tAll("branch.select")}</Label>
            <Select value={filters.branchId ?? ALL} onValueChange={(v) => setParam("branchId", v)}>
              <SelectTrigger data-testid="filter-branch">
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
          </div>
        )}
        <div className="min-w-56 flex-1">
          <SearchBox placeholder={t("filters.search")} />
        </div>
      </div>

      {notice && (
        <Alert
          variant={notice.kind === "ok" ? "default" : "destructive"}
          data-testid="debts-notice"
        >
          {notice.text}
        </Alert>
      )}

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="fullName">{t("columns.student")}</SortHeader>
                </TableHead>
                <TableHead>{t("columns.groups")}</TableHead>
                <TableHead className="text-right">
                  <SortHeader field="amount">{t("columns.amount")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="openedAt">{t("columns.overdue")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="promisedAt">{t("columns.promise")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="lastContactAt">{t("columns.lastContact")}</SortHeader>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((d) => (
                <TableRow key={d.id} data-testid="debt-row">
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/students/${d.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {d.studentName}
                      </Link>
                      {d.status === "PROMISED" && (
                        <Badge variant="secondary" data-testid="debt-status">
                          {t("status.PROMISED")}
                        </Badge>
                      )}
                      {d.status === "CLOSED" && (
                        <Badge variant="outline" data-testid="debt-status">
                          {d.closedReason ? t(`closed.${d.closedReason}`) : t("status.CLOSED")}
                        </Badge>
                      )}
                      {d.needsCall && (
                        <Badge variant="destructive" data-testid="debt-needs-call">
                          {t("needsCall")}
                        </Badge>
                      )}
                    </div>
                    {d.phone && (
                      <a
                        href={`tel:${d.phone}`}
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3" /> {d.phone}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.groups
                      .filter((g) => g.balance < 0)
                      .map((g) => g.groupName)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={d.status === "CLOSED" ? "outline" : "destructive"}
                      className="tabular-nums"
                      data-testid="debt-amount"
                    >
                      {money(d.amount)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium tabular-nums">
                      {t("days", { count: d.daysOverdue })}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t("since", { date: date(d.openedAt) })}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.promisedAt ? (
                      <>
                        <span className={d.promiseMissed ? "text-destructive" : ""}>
                          {date(d.promisedAt)}
                          {d.promiseMissed && ` · ${t("missed")}`}
                        </span>
                        {d.promisedAmount !== null && (
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {money(d.promisedAmount)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {d.brokenPromises > 0 && (
                      <span className="block text-xs text-destructive">
                        {t("brokenPromises", { count: d.brokenPromises })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.lastContactAt ? (
                      <>
                        <span>
                          {fmt(new Date(d.lastContactAt), { dateStyle: "medium" })}
                          {d.lastChannel && ` · ${t(`channels.${d.lastChannel}`)}`}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {d.lastOutcome ? t(`outcomes.${d.lastOutcome}`) : ""}
                          {d.lastOutcome && d.lastContactBy ? " " : ""}
                          {d.lastContactBy ? t("by", { name: d.lastContactBy }) : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("noContact")}</span>
                    )}
                    {(d.telegramAt || d.smsAt) && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {d.telegramAt && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("sentTelegram")}
                          </Badge>
                        )}
                        {d.smsAt && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("sentSms")}
                          </Badge>
                        )}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tc("actionsFor", { name: d.studentName })}
                          disabled={busyId === d.id}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {d.status !== "CLOSED" && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ item: d, channel: "CALL" })}
                              data-testid="debt-call"
                            >
                              <Phone /> {t("actions.call")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ item: d, channel: "NOTE" })}
                              data-testid="debt-log"
                            >
                              {t("actions.log")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => void remind(d)}
                              data-testid="debt-remind"
                            >
                              <Send /> {t("actions.remind")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem onSelect={() => setHistory(d)} data-testid="debt-history">
                          {t("actions.history")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/students/${d.studentId}`)}>
                          {t("actions.profile")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} />

      <ContactDialog
        target={contacting}
        onOpenChange={(open) => {
          if (!open) setContacting(null);
        }}
        onSaved={refresh}
      />
      <HistoryDialog
        item={history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      />
    </div>
  );
}
