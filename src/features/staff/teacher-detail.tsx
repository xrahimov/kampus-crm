"use client";

import { ArrowLeft } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, useRouter } from "@/i18n/navigation";
import type { RoleDto } from "@/server/services/staff/roles.service";
import type { TeacherDetailDto } from "@/server/services/staff/teachers.service";

import { roleLabel } from "./role-label";
import { StaffDialog } from "./staff-dialog";

/** EXP §4 "/mentors/:id": profile card with counters, then the groups list (Phase 5). */
export function TeacherDetail({
  teacher,
  roles,
  branches,
  selfId,
  canUpdate,
}: {
  teacher: TeacherDetailDto;
  roles: RoleDto[];
  branches: BranchOption[];
  selfId: string;
  canUpdate: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const isSupport = teacher.roles.some((r) => r.code === "SUPPORT_TEACHER");

  const stats = [
    { key: "courses", value: teacher.stats.courses },
    { key: "activeGroups", value: teacher.stats.activeGroups },
    { key: "activeStudents", value: teacher.stats.activeStudents },
  ] as const;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/teachers">
          <ArrowLeft /> {t("teachers.title")}
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-wrap items-start gap-6 pt-6">
          <Avatar src={teacher.photoUrl} name={teacher.fullName} className="size-20 text-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{teacher.fullName}</h1>
              {teacher.roles.map((r) => (
                <Badge key={r.code} variant="secondary">
                  {roleLabel(t, r)}
                </Badge>
              ))}
              {teacher.isArchived && <Badge variant="outline">{t("common.archived")}</Badge>}
            </div>
            <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("staff.columns.phone")}</dt>
                <dd className="tabular-nums">{teacher.phone}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("teachers.detail.registered")}</dt>
                <dd>{format.dateTime(new Date(teacher.createdAt), { dateStyle: "medium" })}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{t("teachers.detail.branches")}</dt>
                <dd>{teacher.branches.map((b) => b.name).join(", ") || "—"}</dd>
              </div>
              {teacher.salaryMethod && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("staff.form.salaryMethod")}</dt>
                  <dd>{t(`staff.form.methods.${teacher.salaryMethod}`)}</dd>
                </div>
              )}
            </dl>
          </div>
          {canUpdate && !teacher.isArchived && (
            <Button variant="outline" onClick={() => setEditing(true)} data-testid="edit-teacher">
              {t("common.edit")}
            </Button>
          )}
        </CardContent>
        <CardContent className="grid gap-4 border-t pt-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.key} className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{t(`teachers.detail.${s.key}`)}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("teachers.detail.groups")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title={t("teachers.groupsLater")}
            hint={t("common.comingSoon", { phase: 5 })}
          />
        </CardContent>
      </Card>

      <StaffDialog
        open={editing}
        onOpenChange={setEditing}
        person={teacher}
        scope="teachers"
        kind={isSupport ? "support" : "teachers"}
        roles={roles}
        branches={branches}
        defaultBranchId={teacher.branches[0]?.id ?? ""}
        selfId={selfId}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
