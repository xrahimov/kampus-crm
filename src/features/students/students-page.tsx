"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
import { Avatar } from "@/components/ui/avatar";
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
import { creatableBranches, type BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { Page } from "@/lib/validation/common";
import {
  GROUP_STATUS_FILTERS,
  PAYMENT_STATUS_FILTERS,
  type StudentFilters,
} from "@/lib/validation/students";
import type {
  StudentDetailDto,
  StudentOptions,
  StudentRowDto,
} from "@/server/services/students/students.service";

import { CommentDialog } from "./comment-dialog";
import { StudentDialog } from "./student-dialog";
import { MemberStatusBadge } from "./status-badge";

import { MoreHorizontal } from "lucide-react";

const ALL = "__all";

/** Balance chip: red when in debt, green when in credit. */
export function BalanceBadge({ value, className }: { value: number; className?: string }) {
  const money = useMoneyFormat();
  return (
    <Badge
      variant={value < 0 ? "destructive" : value > 0 ? "success" : "outline"}
      className={`tabular-nums ${className ?? ""}`}
    >
      {money(value)}
    </Badge>
  );
}

/** EXP §6 "/students": header buttons, filter row, table with group chips and the ⋮ menu. */
export function StudentsPage({
  page,
  filters,
  options,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
  can,
}: {
  page: Page<StudentRowDto>;
  filters: StudentFilters;
  options: StudentOptions;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  can: { create: boolean; update: boolean; delete: boolean; blacklist: boolean };
}) {
  const t = useTranslations();
  const ts = useTranslations("students");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; student: StudentDetailDto | null }>({
    open: false,
    student: null,
  });
  const [commenting, setCommenting] = useState<StudentRowDto | null>(null);
  const [archiving, setArchiving] = useState<StudentRowDto | null>(null);
  const [blacklisting, setBlacklisting] = useState<StudentRowDto | null>(null);
  const { options: branchOptions, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());
  const archived = filters.archived ?? false;

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function openEdit(row: StudentRowDto) {
    const detail = await api<StudentDetailDto>(`/students/${row.id}`);
    setDialog({ open: true, student: detail });
  }

  const date = (v: string | null) => (v ? fmt(parseDateOnly(v), { dateStyle: "medium" }) : "—");

  const filterSelect = (
    key: keyof StudentFilters,
    label: string,
    items: Array<{ value: string; label: string }>,
  ) => (
    <div className="min-w-40 space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={(filters[key] as string | undefined) ?? ALL}
        onValueChange={(v) => setParam(key, v)}
      >
        <SelectTrigger data-testid={`filter-${key}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{ts("filters.all")}</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ts("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="students-count">
            {ts("count", { count: page.total })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled title={ts("excel")}>
            {ts("excel")}
          </Button>
          <Button variant="outline" size="sm" disabled title={ts("sms")}>
            {ts("sms")}
          </Button>
          <Button
            variant={archived ? "default" : "outline"}
            size="sm"
            onClick={() => setParam("archived", archived ? null : "true")}
            data-testid="students-archived"
          >
            {archived ? ts("archiveView") : ts("activeView")}
          </Button>
          {can.create && (
            <Button variant="outline" size="sm" disabled title={ts("importExcel")}>
              {ts("importExcel")}
            </Button>
          )}
          {can.create && (
            <Button
              size="sm"
              onClick={() => setDialog({ open: true, student: null })}
              data-testid="add-button"
            >
              <Plus /> {ts("add")}
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/students/badges?${searchParams.toString()}`} target="_blank">
              {ts("badges")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("common.search")}</Label>
          <SearchBox />
        </div>
        {filterSelect(
          "courseId",
          ts("filters.course"),
          options.courses.map((c) => ({ value: c.id, label: c.name })),
        )}
        {filterSelect(
          "schoolId",
          ts("filters.school"),
          options.schools.map((s) => ({ value: s.id, label: s.name })),
        )}
        {filterSelect(
          "groupStatus",
          ts("filters.groupStatus"),
          GROUP_STATUS_FILTERS.filter((s) => s !== "ALL").map((s) => ({
            value: s,
            label: ts(`groupStatusFilters.${s}`),
          })),
        )}
        {filterSelect(
          "paymentStatus",
          ts("filters.paymentStatus"),
          PAYMENT_STATUS_FILTERS.filter((s) => s !== "ALL").map((s) => ({
            value: s,
            label: ts(`paymentStatusFilters.${s}`),
          })),
        )}
        {filterSelect(
          "groupId",
          ts("filters.group"),
          options.groups.map((g) => ({
            value: g.id,
            label: `${g.name}${g.teacherName ? ` (${g.teacherName})` : ""}${g.time ? ` · ${g.time}` : ""}`,
          })),
        )}
        {filterSelect(
          "teacherId",
          ts("filters.teacher"),
          options.teachers.map((x) => ({ value: x.id, label: x.fullName })),
        )}
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{ts("columns.photo")}</TableHead>
                <TableHead>
                  <SortHeader field="fullName">{ts("columns.fullName")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="grade">{ts("columns.grade")}</SortHeader>
                </TableHead>
                <TableHead>{ts("columns.nextPayment")}</TableHead>
                <TableHead>{ts("columns.phone")}</TableHead>
                <TableHead>{ts("columns.note")}</TableHead>
                <TableHead>{ts("columns.groups")}</TableHead>
                <TableHead className="text-right">
                  <SortHeader field="balance">{ts("columns.balance")}</SortHeader>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((s) => (
                <TableRow key={s.id} data-testid="student-row">
                  <TableCell>
                    <Avatar src={s.photoUrl} name={s.fullName} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/students/${s.id}`} className="hover:underline">
                      {s.fullName}
                    </Link>
                    {s.isBlacklisted && (
                      <Badge variant="destructive" className="ml-2">
                        {ts("blacklisted")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s.gradeAverage === null ? (
                      <span className="text-muted-foreground">{ts("noGrade")}</span>
                    ) : (
                      s.gradeAverage
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{date(s.nextPaymentDate)}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{s.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-40 truncate" title={s.note ?? undefined}>
                    {s.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    {s.groups.length === 0 ? (
                      <span className="text-muted-foreground">{ts("noGroups")}</span>
                    ) : (
                      <ul className="space-y-1">
                        {s.groups.map((g) => (
                          <li
                            key={g.membershipId}
                            className="flex flex-wrap items-center gap-1.5 text-xs"
                          >
                            <Link href={`/groups/${g.groupId}`} className="hover:underline">
                              {g.time ? `${g.time} – ` : ""}
                              {g.groupName}
                              {g.teacherName ? ` – ${g.teacherName}` : ""}
                            </Link>
                            <MemberStatusBadge status={g.status} />
                            <BalanceBadge value={g.balance} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <BalanceBadge value={s.balance} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("common.actionsFor", { name: s.fullName })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => router.push(`/students/${s.id}`)}>
                          {ts("actions.view")}
                        </DropdownMenuItem>
                        {can.update && !s.isArchived && (
                          <DropdownMenuItem onSelect={() => void openEdit(s)}>
                            {ts("actions.edit")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => setCommenting(s)}>
                          {ts("actions.comment")}
                        </DropdownMenuItem>
                        {can.blacklist && (
                          <DropdownMenuItem onSelect={() => setBlacklisting(s)}>
                            {s.isBlacklisted ? ts("actions.unblacklist") : ts("actions.blacklist")}
                          </DropdownMenuItem>
                        )}
                        {can.delete && (
                          <>
                            <DropdownMenuSeparator />
                            {s.isArchived ? (
                              <DropdownMenuItem
                                onSelect={async () => {
                                  await api(`/students/${s.id}/restore`, { method: "POST" });
                                  refresh();
                                }}
                              >
                                {ts("actions.restore")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => setArchiving(s)}
                                className="text-destructive focus:text-destructive"
                              >
                                {ts("actions.archive")}
                              </DropdownMenuItem>
                            )}
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

      <StudentDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        student={dialog.student}
        options={options}
        branches={branchOptions}
        defaultBranchId={defaultId}
        onSaved={(saved) => {
          if (!dialog.student) router.push(`/students/${saved.id}`);
          else refresh();
        }}
      />
      <CommentDialog
        student={commenting}
        onOpenChange={(open) => !open && setCommenting(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={ts("archiveTitle")}
        description={ts("archiveText", { name: archiving?.fullName ?? "" })}
        confirmLabel={ts("actions.archive")}
        onConfirm={async () => {
          if (!archiving) return;
          await api(`/students/${archiving.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!blacklisting}
        onOpenChange={(open) => !open && setBlacklisting(null)}
        title={blacklisting?.isBlacklisted ? ts("actions.unblacklist") : ts("blacklistTitle")}
        description={
          blacklisting?.isBlacklisted
            ? ""
            : ts("blacklistText", { name: blacklisting?.fullName ?? "" })
        }
        confirmLabel={
          blacklisting?.isBlacklisted ? ts("actions.unblacklist") : ts("actions.blacklist")
        }
        onConfirm={async () => {
          if (!blacklisting) return;
          await api(`/students/${blacklisting.id}/blacklist`, {
            method: "POST",
            body: { value: !blacklisting.isBlacklisted },
          });
          refresh();
        }}
      />
    </div>
  );
}
