"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SearchBox } from "@/components/data/search-box";
import { SortHeader } from "@/components/data/sort-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { creatableBranches, type BranchOption } from "@/features/settings/shared/branch-select";
import { RowActions } from "@/features/settings/shared/row-actions";
import { SendSmsDialog } from "@/features/sms/send-sms-dialog";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import type { Page } from "@/lib/validation/common";
import { TEACHER_KINDS, type TeacherKind } from "@/lib/validation/staff";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { RoleDto } from "@/server/services/staff/roles.service";
import type { StaffDto } from "@/server/services/staff/staff.service";
import type { TeacherRowDto } from "@/server/services/staff/teachers.service";

import { StaffDialog } from "./staff-dialog";

/** EXP §4 "/mentors": two tabs, archive toggle, add button, table with ⋮ actions. */
export function TeachersPage({
  page,
  kind,
  archived,
  roles,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
  selfId,
  canCreate,
  canUpdate,
  canDelete,
  canSms,
}: {
  page: Page<TeacherRowDto>;
  kind: TeacherKind;
  archived: boolean;
  roles: RoleDto[];
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
  selfId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canSms: boolean;
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
  const [sms, setSms] = useState<
    | { kind: "teachers"; archived: boolean }
    | { kind: "staff"; userIds: string[]; name: string }
    | null
  >(null);
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
  const date = (value: string | null) =>
    value ? fmt(parseDateOnly(value), { dateStyle: "medium" }) : "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("teachers.title")}</h1>
        <div className="flex flex-wrap gap-2">
          {canSms && (
            <Button
              variant="outline"
              onClick={() => setSms({ kind: "teachers", archived })}
              disabled={page.total === 0}
              data-testid="teachers-sms"
            >
              {t("teachers.sms")}
            </Button>
          )}
          {canCreate && (
            <Button
              onClick={() => setDialog({ open: true, person: null })}
              data-testid="add-button"
            >
              {t("teachers.add")}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={kind} onValueChange={(v) => setParam("tab", v === "teachers" ? null : v)}>
        <TabsList aria-label={t("teachers.tabsLabel")}>
          {TEACHER_KINDS.map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>
              {t(`teachers.tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox />
        <div className="flex items-center gap-2">
          <Switch
            id="teachers-archived"
            checked={archived}
            onCheckedChange={(v) => setParam("archived", v ? "true" : null)}
          />
          <Label htmlFor="teachers-archived">{t("common.archived")}</Label>
        </div>
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
                {kind === "teachers" ? (
                  <>
                    <TableHead>{t("staff.columns.fixedSalary")}</TableHead>
                    <TableHead>{t("staff.columns.percentShare")}</TableHead>
                    <TableHead>{t("staff.columns.perLessonFee")}</TableHead>
                    <TableHead>{t("staff.columns.perStudentFee")}</TableHead>
                    <TableHead>
                      <SortHeader field="birthDate">{t("staff.columns.birthDate")}</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader field="hireDate">{t("staff.columns.hireDate")}</SortHeader>
                    </TableHead>
                  </>
                ) : (
                  <TableHead>{t("teachers.columns.groups")}</TableHead>
                )}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((person) => (
                <TableRow key={person.id} data-testid="teacher-row">
                  <TableCell className="font-medium">
                    <Link
                      href={`/teachers/${person.id}`}
                      className="inline-flex items-center gap-3 hover:underline"
                    >
                      <Avatar src={person.photoUrl} name={person.fullName} />
                      {person.fullName}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">{person.phone}</TableCell>
                  {kind === "teachers" ? (
                    <>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {money(person.fixedSalary)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {person.percentShare === null ? "—" : `${person.percentShare}%`}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {money(person.perLessonFee)}
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {money(person.perStudentFee)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{date(person.birthDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{date(person.hireDate)}</TableCell>
                    </>
                  ) : (
                    <TableCell>
                      {person.groupNames.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        person.groupNames.join(", ")
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    {!person.isArchived && (canUpdate || canDelete || canSms) && (
                      <RowActions
                        name={person.fullName}
                        extra={
                          canSms
                            ? [
                                {
                                  label: t("teachers.sms"),
                                  onSelect: () =>
                                    setSms({
                                      kind: "staff",
                                      userIds: [person.id],
                                      name: person.fullName,
                                    }),
                                  testId: "teacher-sms",
                                },
                              ]
                            : undefined
                        }
                        onEdit={canUpdate ? () => setDialog({ open: true, person }) : undefined}
                        onDelete={canDelete ? () => setArchiving(person) : undefined}
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
        scope="teachers"
        kind={kind}
        roles={roles}
        branches={options}
        defaultBranchId={defaultId}
        selfId={selfId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t("teachers.archiveTitle")}
        description={t("teachers.archiveText", { name: archiving?.fullName ?? "" })}
        confirmLabel={t("common.archive")}
        onConfirm={async () => {
          if (!archiving) return;
          await api(`/teachers/${archiving.id}`, { method: "DELETE" });
          refresh();
        }}
      />
      <SendSmsDialog
        open={sms !== null}
        onOpenChange={(open) => {
          if (!open) setSms(null);
        }}
        target={sms ? (sms.kind === "staff" ? { kind: "staff", userIds: sms.userIds } : sms) : null}
        title={sms?.kind === "staff" ? t("sms.send.toStudent", { name: sms.name }) : undefined}
      />
    </div>
  );
}
