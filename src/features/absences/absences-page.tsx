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
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { ExcelLink } from "@/features/shared/excel-link";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import {
  ABSENCE_LIST_FILTERS,
  ABSENCE_REASONS,
  type AbsenceFilters,
} from "@/lib/validation/absences";
import type { AbsenceCaseDto, AbsenceListDto } from "@/server/services/absences/absences.service";

import { ContactDialog, type ContactTarget } from "./contact-dialog";
import { HistoryDialog } from "./history-dialog";

const ALL = "__all";

/** "/absences" (A-125): who stopped coming, since when, and who last reached them. */
export function AbsencesPage({
  list,
  filters,
  branches,
}: {
  list: AbsenceListDto;
  filters: AbsenceFilters;
  /** Branches to filter by; empty when the header already pins one branch. */
  branches: BranchOption[];
}) {
  const t = useTranslations("absences");
  const tc = useTranslations("common");
  const tAll = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [contacting, setContacting] = useState<ContactTarget | null>(null);
  const [history, setHistory] = useState<AbsenceCaseDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const status = filters.status ?? "OPEN";
  const summary: Array<{ key: keyof AbsenceListDto["summary"]; label: string; value: number }> = [
    { key: "open", label: t("summary.open"), value: list.summary.open },
    { key: "noContact", label: t("summary.noContact"), value: list.summary.noContact },
    { key: "streak", label: t("summary.streak"), value: list.summary.streak },
    {
      key: "silent",
      label:
        list.rules.silentDays === null
          ? t("summary.silentOff")
          : t("summary.silent", { days: list.rules.silentDays }),
      value: list.summary.silent,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="absences-count">
            {t("count", { count: list.total })}
          </p>
        </div>
        <ExcelLink path="/absences/export.xlsx" params={searchParams} testId="absences-excel" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.key} data-testid={`absences-summary-${s.key}`}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.status")}</Label>
          <Select value={status} onValueChange={(v) => setParam("status", v === "OPEN" ? null : v)}>
            <SelectTrigger data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABSENCE_LIST_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {t(`filters.${f}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.reason")}</Label>
          <Select value={filters.reason ?? ALL} onValueChange={(v) => setParam("reason", v)}>
            <SelectTrigger data-testid="filter-reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.anyReason")}</SelectItem>
              {ABSENCE_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`filters.${r}`)}
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
                <TableHead>
                  <SortHeader field="group">{t("columns.group")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="sinceAt">{t("columns.absence")}</SortHeader>
                </TableHead>
                <TableHead>{t("columns.lastSeen")}</TableHead>
                <TableHead>
                  <SortHeader field="lastContactAt">{t("columns.lastContact")}</SortHeader>
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((d) => (
                <TableRow key={d.id} data-testid="absence-row">
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/students/${d.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {d.studentName}
                      </Link>
                      {d.status === "CLOSED" && (
                        <Badge variant="outline" data-testid="absence-status">
                          {d.closedReason ? t(`closed.${d.closedReason}`) : t("status.CLOSED")}
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
                    <Link href={`/groups/${d.groupId}`} className="hover:underline">
                      {d.groupName}
                    </Link>
                    {d.teacher && (
                      <span className="block text-xs text-muted-foreground">
                        {t("teacher", { name: d.teacher })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge
                      variant={d.status === "CLOSED" ? "outline" : "destructive"}
                      data-testid="absence-reason"
                    >
                      {t(`reason.${d.reason}`, { count: d.missed })}
                    </Badge>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("since", { date: date(d.sinceAt) })} · {t("days", { count: d.days })}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.lastPresentAt ? (
                      date(d.lastPresentAt)
                    ) : (
                      <span className="text-muted-foreground">{t("never")}</span>
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
                      <span className="text-muted-foreground" data-testid="absence-no-contact">
                        {t("noContact")}
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
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {d.status !== "CLOSED" && (
                          <>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ item: d, channel: "CALL" })}
                              data-testid="absence-call"
                            >
                              <Phone /> {t("actions.call")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setContacting({ item: d, channel: "NOTE" })}
                              data-testid="absence-log"
                            >
                              {t("actions.log")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onSelect={() => setHistory(d)}
                          data-testid="absence-history"
                        >
                          {t("actions.history")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/students/${d.studentId}`)}>
                          {t("actions.profile")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push(`/groups/${d.groupId}`)}>
                          {t("actions.group")}
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
