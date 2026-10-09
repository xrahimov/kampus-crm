"use client";

import { MoreHorizontal, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { cn } from "@/lib/utils";
import { LEAD_CALL_RANGES, type LeadCallsFilters } from "@/lib/validation/leads";
import type { LeadCallDto, LeadCallsListDto } from "@/server/services/leads/follow-up.service";

import { STATUS_VARIANT } from "./lead-card";
import { LeadContactDialog, type LeadContactTarget } from "./lead-contact-dialog";
import { LeadHistoryDialog } from "./lead-history-dialog";

const ALL = "__all";

/** "/leads/calls" (A-126): who to call today, who owns the lead and how the last contact ended. */
export function CallsPage({
  list,
  filters,
  owners,
  userId,
  canUpdate,
}: {
  list: LeadCallsListDto;
  filters: LeadCallsFilters;
  owners: Array<{ id: string; fullName: string }>;
  userId: string;
  canUpdate: boolean;
}) {
  const t = useTranslations("leads");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [contacting, setContacting] = useState<LeadContactTarget | null>(null);
  const [history, setHistory] = useState<LeadCallDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const range = filters.range ?? "DUE";
  const summary: Array<{
    key: keyof LeadCallsListDto["summary"];
    range: (typeof LEAD_CALL_RANGES)[number];
    value: number;
  }> = [
    { key: "overdue", range: "OVERDUE", value: list.summary.overdue },
    { key: "today", range: "TODAY", value: list.summary.today },
    { key: "upcoming", range: "UPCOMING", value: list.summary.upcoming },
    { key: "none", range: "NONE", value: list.summary.none },
  ];
  const boardHref = (d: LeadCallDto) =>
    `/leads?board=${d.boardId}&q=${encodeURIComponent(d.fullName)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("calls.title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="calls-count">
            {t("calls.count", { count: list.total })}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/leads">{t("title")}</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((s) => (
          <Card
            key={s.key}
            className={cn(range === s.range && "ring-2 ring-primary/50")}
            data-testid={`calls-summary-${s.key}`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => setParam("range", range === s.range ? null : s.range)}
            >
              <CardContent className="space-y-1 p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t(`calls.summary.${s.key}`)}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
              </CardContent>
            </button>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("calls.filters.range")}</Label>
          <Select value={range} onValueChange={(v) => setParam("range", v === "DUE" ? null : v)}>
            <SelectTrigger data-testid="calls-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_CALL_RANGES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`calls.filters.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("calls.filters.owner")}</Label>
          <Select value={filters.ownerId ?? ALL} onValueChange={(v) => setParam("ownerId", v)}>
            <SelectTrigger data-testid="calls-owner">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("calls.filters.allOwners")}</SelectItem>
              <SelectItem value="me">{t("calls.filters.me")}</SelectItem>
              <SelectItem value="none">{t("calls.filters.unassigned")}</SelectItem>
              {owners
                .filter((o) => o.id !== userId)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.fullName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-56 flex-1">
          <SearchBox placeholder={t("calls.filters.search")} />
        </div>
      </div>

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={t("calls.empty")} hint={t("calls.emptyHint")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="fullName">{t("calls.columns.lead")}</SortHeader>
                </TableHead>
                <TableHead>{t("calls.columns.owner")}</TableHead>
                <TableHead>
                  <SortHeader field="nextContactAt">{t("calls.columns.next")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="lastContactAt">{t("calls.columns.last")}</SortHeader>
                </TableHead>
                <TableHead>{t("calls.columns.status")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((d) => (
                <TableRow key={d.id} data-testid="call-row">
                  <TableCell>
                    <Link href={boardHref(d)} className="font-medium hover:underline">
                      {d.fullName}
                    </Link>
                    {d.phones[0] && (
                      <a
                        href={`tel:${d.phones[0]}`}
                        className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="size-3" /> {d.phones[0]}
                        {d.phones.length > 1 && ` +${d.phones.length - 1}`}
                      </a>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      {d.boardName} · {d.columnName}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.ownerName ?? (
                      <span className="text-muted-foreground">{t("calls.noOwner")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.nextContactAt ? (
                      <>
                        <span data-testid="call-next">{date(d.nextContactAt)}</span>
                        {d.overdueDays !== null && d.overdueDays > 0 && (
                          <Badge variant="destructive" className="ml-2" data-testid="call-overdue">
                            {t("followUp.overdue", { count: d.overdueDays })}
                          </Badge>
                        )}
                        {d.overdueDays === 0 && (
                          <Badge
                            className="ml-2 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            data-testid="call-due-today"
                          >
                            {t("followUp.today")}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t("calls.noDate")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.lastContactAt ? (
                      <>
                        <span>{fmt(new Date(d.lastContactAt), { dateStyle: "medium" })}</span>
                        <span className="block text-xs text-muted-foreground">
                          {d.lastOutcome ? t(`outcomes.${d.lastOutcome}`) : ""}
                          {d.lastOutcome && d.lastContactBy ? " " : ""}
                          {d.lastContactBy ? t("calls.by", { name: d.lastContactBy }) : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground" data-testid="call-no-contact">
                        {t("calls.noContact")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status]} data-testid="call-status">
                      {t(`statuses.${d.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tc("actionsFor", { name: d.fullName })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canUpdate && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ lead: d, channel: "CALL" })}
                              data-testid="call-log-call"
                            >
                              <Phone /> {t("calls.actions.call")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ lead: d, channel: "NOTE" })}
                              data-testid="call-log-note"
                            >
                              {t("calls.actions.log")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem onSelect={() => setHistory(d)} data-testid="call-history">
                          {t("calls.actions.history")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(boardHref(d))}>
                          {t("calls.actions.board")}
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

      <LeadContactDialog
        target={contacting}
        onOpenChange={(open) => {
          if (!open) setContacting(null);
        }}
        onSaved={refresh}
      />
      <LeadHistoryDialog
        lead={history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      />
    </div>
  );
}
