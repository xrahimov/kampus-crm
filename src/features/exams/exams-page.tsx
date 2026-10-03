"use client";

import { Eye, Flag, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import { EXAM_STATUSES, type ExamFilters, type ExamStatus } from "@/lib/validation/exams";
import type { ExamDto, ExamListDto, ExamOptions } from "@/server/services/exams/exams.service";

import { ExamDialog } from "./exam-dialog";

const ALL = "ALL";

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const t = useTranslations("exams.statuses");
  return <Badge variant={status === "FINISHED" ? "success" : "secondary"}>{t(status)}</Badge>;
}

/** EXP §7 "/exams": group / mock tabs with counters, filters, table with ⋮ actions. */
export function ExamsPage({
  list,
  filters,
  options,
  branches,
  can,
}: {
  list: ExamListDto;
  filters: Omit<ExamFilters, "status"> & { status: ExamStatus | "ALL" };
  options: ExamOptions;
  branches: BranchOption[];
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const t = useTranslations();
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; exam: ExamDto | null }>({
    open: false,
    exam: null,
  });
  const [deleting, setDeleting] = useState<ExamDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParams(entries: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(entries)) {
      if (value && value !== ALL) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function setStatus(exam: ExamDto, finished: boolean) {
    await api(`/exams/${exam.id}/${finished ? "finish" : "reopen"}`, { method: "POST" });
    refresh();
  }

  const date = (value: string) => fmt(parseDateOnly(value), { dateStyle: "medium" });
  const mock = filters.type === "MOCK";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("exams.title")}</h1>
        {can.create && (
          <Button onClick={() => setDialog({ open: true, exam: null })} data-testid="add-button">
            {t("exams.add")}
          </Button>
        )}
      </div>

      <Tabs
        value={filters.type}
        onValueChange={(v) => setParams({ type: v === "GROUP" ? null : v })}
      >
        <TabsList>
          {(["GROUP", "MOCK"] as const).map((type) => (
            <TabsTrigger key={type} value={type} data-testid={`exam-tab-${type}`}>
              {t(`exams.tabs.${type}`)}{" "}
              <span className="ml-1 text-muted-foreground" data-testid={`exam-count-${type}`}>
                {list.counts[type]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.status}
          onValueChange={(v) => setParams({ status: v === "NOT_STARTED" ? null : v })}
        >
          <SelectTrigger
            className="w-40"
            aria-label={t("common.status")}
            data-testid="filter-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("exams.filters.anyStatus")}</SelectItem>
            {EXAM_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`exams.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.groupId ?? ALL} onValueChange={(v) => setParams({ groupId: v })}>
          <SelectTrigger className="w-48" aria-label={t("exams.filters.group")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("exams.filters.anyGroup")}</SelectItem>
            {options.groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          {t("exams.filters.from")}
          <Input
            type="date"
            className="w-40"
            value={filters.from ?? ""}
            onChange={(e) => setParams({ from: e.target.value || null })}
            aria-label={t("exams.filters.from")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t("exams.filters.to")}
          <Input
            type="date"
            className="w-40"
            value={filters.to ?? ""}
            onChange={(e) => setParams({ to: e.target.value || null })}
            aria-label={t("exams.filters.to")}
          />
        </label>
      </div>

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("exams.columns.name")}</TableHead>
                  <TableHead>{t("exams.columns.type")}</TableHead>
                  <TableHead>
                    {mock ? t("exams.columns.groups") : t("exams.columns.group")}
                  </TableHead>
                  <TableHead>{t("exams.columns.date")}</TableHead>
                  <TableHead>{t("exams.columns.examiner")}</TableHead>
                  <TableHead>{t("exams.columns.room")}</TableHead>
                  <TableHead>{t("exams.columns.time")}</TableHead>
                  {mock && <TableHead className="text-right">{t("exams.columns.price")}</TableHead>}
                  <TableHead className="text-right">
                    {mock ? t("exams.columns.registrations") : t("exams.columns.students")}
                  </TableHead>
                  {mock && (
                    <TableHead className="text-right">{t("exams.columns.capacity")}</TableHead>
                  )}
                  <TableHead className="text-right">{t("exams.columns.passScore")}</TableHead>
                  <TableHead className="text-right">{t("exams.columns.maxScore")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((x) => (
                  <TableRow key={x.id} data-testid="exam-row">
                    <TableCell className="font-medium">
                      <Link href={`/exams/${x.id}`} className="hover:underline">
                        {x.name}
                      </Link>
                      {x.isRetake && (
                        <Badge variant="outline" className="ml-2">
                          {t("exams.columns.retake")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t(`exams.types.${x.type}`)}</TableCell>
                    <TableCell>
                      {x.type === "GROUP" ? x.groupName : x.groups.map((g) => g.name).join(", ")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{date(x.date)}</TableCell>
                    <TableCell>{x.examinerName ?? "—"}</TableCell>
                    <TableCell>{x.roomName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {x.startTime} – {x.endTime}
                    </TableCell>
                    {mock && (
                      <TableCell className="text-right tabular-nums">{money(x.price)}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{x.studentCount}</TableCell>
                    {mock && (
                      <TableCell className="text-right tabular-nums">{x.capacity ?? "—"}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{x.passScore}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.maxScore}</TableCell>
                    <TableCell>
                      <ExamStatusBadge status={x.status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("common.actionsFor", { name: x.name })}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => router.push(`/exams/${x.id}`)}>
                            <Eye /> {t("exams.actions.results")}
                          </DropdownMenuItem>
                          {can.update && (
                            <>
                              <DropdownMenuItem onSelect={() => setDialog({ open: true, exam: x })}>
                                <Pencil /> {t("common.edit")}
                              </DropdownMenuItem>
                              {x.status === "NOT_STARTED" ? (
                                <DropdownMenuItem onSelect={() => void setStatus(x, true)}>
                                  <Flag /> {t("exams.actions.finish")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void setStatus(x, false)}>
                                  <RotateCcw /> {t("exams.actions.reopen")}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                          {can.delete && x.gradedCount === 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setDeleting(x)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 /> {t("common.delete")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ExamDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        exam={dialog.exam}
        options={options}
        branches={branches}
        defaultType={filters.type}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("exams.deleteTitle")}
        description={t("exams.deleteText", { name: deleting?.name ?? "" })}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/exams/${deleting.id}`, { method: "DELETE" });
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
}
