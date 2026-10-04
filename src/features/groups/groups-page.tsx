"use client";

import {
  ArrowRightLeft,
  Eye,
  Flag,
  MoreHorizontal,
  Pencil,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
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
import { creatableBranches, type BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import type { Page } from "@/lib/validation/common";
import { useDateFormat } from "@/lib/use-date-format";
import {
  GROUP_STATUSES,
  WEEKDAY_PATTERNS,
  type GroupStatus,
  type WeekdayPattern,
} from "@/lib/validation/groups";
import type { GroupDto } from "@/server/services/groups/groups.service";
import type { GroupFormOptions } from "@/server/services/groups/options.service";

import { SendSmsDialog } from "@/features/sms/send-sms-dialog";

import { GroupDialog } from "./group-dialog";
import { MoveBranchDialog } from "./move-branch-dialog";
import { weekdayLabel } from "./weekday";

const ALL = "ALL";

export function GroupStatusBadge({ status }: { status: GroupStatus }) {
  const t = useTranslations("groups.statuses");
  const variant = status === "ACTIVE" ? "success" : status === "ARCHIVED" ? "muted" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** EXP §5 "/groups": filters, table with ⋮ actions, add button. */
export function GroupsPage({
  page,
  filters,
  options,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
  can,
}: {
  page: Page<GroupDto>;
  filters: {
    status: GroupStatus | "ALL";
    teacherId: string | null;
    courseId: string | null;
    weekdayPattern: WeekdayPattern | null;
  };
  options: GroupFormOptions;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  can: { create: boolean; update: boolean; delete: boolean; sms: boolean };
}) {
  const t = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; group: GroupDto | null }>({
    open: false,
    group: null,
  });
  const [moving, setMoving] = useState<GroupDto | null>(null);
  const [finishing, setFinishing] = useState<GroupDto | null>(null);
  const [smsGroup, setSmsGroup] = useState<GroupDto | null>(null);
  const [archiving, setArchiving] = useState<GroupDto | null>(null);
  const { options: branchOptions, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const date = (value: string) => fmt(parseDateOnly(value), { dateStyle: "medium" });
  const scheduleDays = (g: GroupDto) =>
    g.weekdayPattern === "CUSTOM"
      ? g.slots.map((s) => weekdayLabel(fmt, s.weekday)).join(", ")
      : t(`groups.patterns.${g.weekdayPattern}`);
  const scheduleTime = (g: GroupDto) => {
    const first = g.slots[0];
    if (!first) return "—";
    const same = g.slots.every(
      (s) => s.startTime === first.startTime && s.endTime === first.endTime,
    );
    return same ? `${first.startTime} – ${first.endTime}` : t("groups.perDaySchedule");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("groups.title")} <span className="text-muted-foreground">({page.total})</span>
        </h1>
        {can.create && (
          <Button onClick={() => setDialog({ open: true, group: null })} data-testid="add-button">
            {t("groups.add")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox />
        <Select
          value={filters.status}
          onValueChange={(v) => setParam("status", v === "ACTIVE" ? null : v)}
        >
          <SelectTrigger
            className="w-40"
            aria-label={t("common.status")}
            data-testid="filter-status"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("groups.filters.all")}</SelectItem>
            {GROUP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`groups.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.teacherId ?? ALL} onValueChange={(v) => setParam("teacherId", v)}>
          <SelectTrigger className="w-44" aria-label={t("groups.columns.teacher")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("groups.filters.anyTeacher")}</SelectItem>
            {options.teachers.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.courseId ?? ALL} onValueChange={(v) => setParam("courseId", v)}>
          <SelectTrigger className="w-44" aria-label={t("groups.columns.course")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("groups.filters.anyCourse")}</SelectItem>
            {options.courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.weekdayPattern ?? ALL}
          onValueChange={(v) => setParam("weekdayPattern", v)}
        >
          <SelectTrigger className="w-40" aria-label={t("groups.columns.days")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("groups.filters.anyDays")}</SelectItem>
            {WEEKDAY_PATTERNS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`groups.patterns.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="name">{t("groups.columns.name")}</SortHeader>
                </TableHead>
                <TableHead>{t("groups.columns.course")}</TableHead>
                <TableHead>{t("groups.columns.teacher")}</TableHead>
                <TableHead>{t("groups.columns.support")}</TableHead>
                <TableHead>{t("groups.columns.days")}</TableHead>
                <TableHead>{t("groups.columns.time")}</TableHead>
                <TableHead className="text-right">{t("groups.columns.students")}</TableHead>
                <TableHead>
                  <SortHeader field="startDate">{t("groups.columns.opened")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="endDate">{t("groups.columns.ends")}</SortHeader>
                </TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((g) => (
                <TableRow
                  key={g.id}
                  data-testid="group-row"
                  title={g.lessonsHeld === 0 ? t("groups.noLessonYet") : undefined}
                  style={
                    g.courseColor ? { boxShadow: `inset 4px 0 0 ${g.courseColor}` } : undefined
                  }
                >
                  <TableCell className="font-medium">
                    <Link href={`/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </TableCell>
                  <TableCell>{g.courseName}</TableCell>
                  <TableCell>{g.teachers.map((x) => x.fullName).join(", ") || "—"}</TableCell>
                  <TableCell>
                    {g.supportTeachers.map((x) => x.fullName).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{scheduleDays(g)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {scheduleTime(g)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{g.activeStudents}</TableCell>
                  <TableCell className="whitespace-nowrap">{date(g.startDate)}</TableCell>
                  <TableCell className="whitespace-nowrap">{date(g.endDate)}</TableCell>
                  <TableCell>
                    <GroupStatusBadge status={g.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.actionsFor", { name: g.name })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/groups/${g.id}`)}>
                          <Eye /> {t("groups.actions.view")}
                        </DropdownMenuItem>
                        {can.sms && (
                          <DropdownMenuItem onSelect={() => setSmsGroup(g)} data-testid="group-sms">
                            <MessageSquare /> {t("groups.actions.sms")}
                          </DropdownMenuItem>
                        )}
                        {can.update && g.status !== "ARCHIVED" && (
                          <>
                            <DropdownMenuItem onSelect={() => setDialog({ open: true, group: g })}>
                              <Pencil /> {t("common.edit")}
                            </DropdownMenuItem>
                            {branchOptions.length > 1 && (
                              <DropdownMenuItem onSelect={() => setMoving(g)}>
                                <ArrowRightLeft /> {t("groups.actions.moveBranch")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setFinishing(g)}>
                              <Flag /> {t("groups.actions.finish")}
                            </DropdownMenuItem>
                          </>
                        )}
                        {can.delete && g.status !== "ARCHIVED" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setArchiving(g)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 /> {t("common.archive")}
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
        )}
      </Card>
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />

      <GroupDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        group={dialog.group}
        branches={branchOptions}
        defaultBranchId={defaultId}
        courses={options.courses}
        rooms={options.rooms}
        gradingSystems={options.gradingSystems}
        teachers={options.teachers}
        onSaved={refresh}
      />
      <MoveBranchDialog
        group={moving}
        branches={branchOptions}
        onOpenChange={(open) => !open && setMoving(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!finishing}
        onOpenChange={(open) => !open && setFinishing(null)}
        title={t("groups.finishTitle")}
        description={t("groups.finishText", { name: finishing?.name ?? "" })}
        confirmLabel={t("groups.actions.finish")}
        onConfirm={async () => {
          if (!finishing) return;
          await api(`/groups/${finishing.id}/finish`, { method: "POST" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t("groups.archiveTitle")}
        description={t("groups.archiveText", { name: archiving?.name ?? "" })}
        confirmLabel={t("common.archive")}
        onConfirm={async () => {
          if (!archiving) return;
          await api(`/groups/${archiving.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <SendSmsDialog
        open={smsGroup !== null}
        onOpenChange={(open) => {
          if (!open) setSmsGroup(null);
        }}
        target={smsGroup ? { kind: "group", groupId: smsGroup.id } : null}
        title={smsGroup ? t("sms.send.toStudent", { name: smsGroup.name }) : undefined}
      />
    </div>
  );
}
