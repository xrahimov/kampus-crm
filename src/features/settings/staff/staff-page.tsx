"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SortHeader } from "@/components/data/sort-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabel } from "@/features/staff/role-label";
import { StaffDialog } from "@/features/staff/staff-dialog";
import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Page } from "@/lib/validation/common";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { RoleDto } from "@/server/services/staff/roles.service";
import type { RoleCount, StaffDto } from "@/server/services/staff/staff.service";

import { creatableBranches, type BranchOption } from "../shared/branch-select";
import { ExcelLink } from "@/features/shared/excel-link";

import { ListHeader } from "../shared/list-header";
import { RowActions } from "../shared/row-actions";

/** EXP §8 "Xodimlar": search, role chips with counts, archive toggle, table, ⋮ actions. */
export function StaffPage({
  page,
  roleCounts,
  roleCode,
  archived,
  roles,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
  selfId,
  canUpdate,
  canDelete,
}: {
  page: Page<StaffDto>;
  roleCounts: RoleCount[];
  roleCode: string | null;
  archived: boolean;
  roles: RoleDto[];
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  selfId: string;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations();
  const formatMoney = useMoneyFormat();
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; person: StaffDto | null }>({
    open: false,
    person: null,
  });
  const [archiving, setArchiving] = useState<StaffDto | null>(null);
  const { options, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const money = (value: number | null) => (value === null ? "—" : formatMoney(value));
  const total = roleCounts.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("staff.title")}
        description={t("staff.description")}
        addLabel={t("staff.form.addStaff")}
        onAdd={() => setDialog({ open: true, person: null })}
      >
        <div className="flex items-center gap-2">
          <Switch
            id="staff-archived"
            checked={archived}
            onCheckedChange={(v) => setParam("archived", v ? "true" : null)}
          />
          <Label htmlFor="staff-archived">{t("common.archived")}</Label>
        </div>
        <ExcelLink path="/staff/export.xlsx" params={searchParams} testId="staff-excel" />
      </ListHeader>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("staff.filterByRole")}>
        <RoleChip
          active={roleCode === null}
          label={t("staff.allRoles")}
          count={total}
          onClick={() => setParam("role", null)}
        />
        {roleCounts
          .filter((r) => r.count > 0 || r.code === roleCode)
          .map((r) => (
            <RoleChip
              key={r.code}
              active={roleCode === r.code}
              label={roleLabel(t, r)}
              count={r.count}
              onClick={() => setParam("role", r.code)}
            />
          ))}
      </div>

      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="fullName">{t("staff.columns.fullName")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="phone">{t("staff.columns.phone")}</SortHeader>
                </TableHead>
                <TableHead>{t("staff.columns.fixedSalary")}</TableHead>
                <TableHead>{t("staff.columns.percentShare")}</TableHead>
                <TableHead>{t("staff.columns.roles")}</TableHead>
                <TableHead>{t("branch.select")}</TableHead>
                <TableHead>
                  <SortHeader field="hireDate">{t("staff.columns.hireDate")}</SortHeader>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((person) => (
                <TableRow key={person.id} data-testid="staff-row">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-3">
                      <Avatar src={person.photoUrl} name={person.fullName} />
                      {person.fullName}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{person.phone}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {money(person.fixedSalary)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {person.percentShare === null ? "—" : `${person.percentShare}%`}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {person.roles.map((r) => (
                        <Badge key={r.code} variant="secondary">
                          {roleLabel(t, r)}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell>{person.branches.map((b) => b.name).join(", ") || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {person.hireDate
                      ? fmt(parseDateOnly(person.hireDate), { dateStyle: "medium" })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {!person.isArchived && (canUpdate || canDelete) && (
                      <RowActions
                        name={person.fullName}
                        onEdit={() => setDialog({ open: true, person })}
                        onDelete={() => setArchiving(person)}
                        deleteLabel={t("common.archive")}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />

      <StaffDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        person={dialog.person}
        scope="staff"
        roles={roles}
        branches={options}
        defaultBranchId={defaultId}
        selfId={selfId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t("staff.archiveTitle")}
        description={t("staff.archiveText", { name: archiving?.fullName ?? "" })}
        confirmLabel={t("common.archive")}
        onConfirm={async () => {
          if (!archiving) return;
          await api(`/staff/${archiving.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}

function RoleChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
