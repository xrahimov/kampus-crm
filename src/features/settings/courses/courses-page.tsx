"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SortHeader } from "@/components/data/sort-header";
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
import { usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { Page } from "@/lib/validation/common";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { CourseDto } from "@/server/services/settings/courses.service";
import type { GradingSystemDto } from "@/server/services/settings/grading-systems.service";

import { creatableBranches, type BranchOption } from "../shared/branch-select";
import { ListHeader } from "../shared/list-header";
import { RowActions } from "../shared/row-actions";
import { CourseDialog } from "./course-dialog";

export function CoursesPage({
  page,
  archived,
  branches,
  gradingSystems,
  actorBranchIds,
  activeBranchId,
  allBranches,
}: {
  page: Page<CourseDto>;
  archived: boolean;
  branches: BranchOption[];
  gradingSystems: GradingSystemDto[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
}) {
  const t = useTranslations();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; course: CourseDto | null }>({
    open: false,
    course: null,
  });
  const [archiving, setArchiving] = useState<CourseDto | null>(null);
  const { options, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());

  function toggleArchived(value: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("archived", "true");
    else params.delete("archived");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("settings.courses.title")}
        description={t("settings.courses.description")}
        addLabel={t("settings.courses.add")}
        onAdd={() => setDialog({ open: true, course: null })}
      >
        <div className="flex items-center gap-2">
          <Switch id="courses-archived" checked={archived} onCheckedChange={toggleArchived} />
          <Label htmlFor="courses-archived">{t("common.archived")}</Label>
        </div>
      </ListHeader>
      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="name">{t("settings.courses.name")}</SortHeader>
                </TableHead>
                <TableHead>{t("branch.select")}</TableHead>
                <TableHead>
                  <SortHeader field="price">{t("settings.courses.price")}</SortHeader>
                </TableHead>
                <TableHead>
                  <SortHeader field="durationMonths">
                    {t("settings.courses.durationShort")}
                  </SortHeader>
                </TableHead>
                <TableHead>{t("settings.courses.gradingSystem")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((course) => (
                <TableRow key={course.id} data-testid="course-row">
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: course.color ?? "var(--color-muted-foreground)" }}
                      />
                      {course.name}
                    </span>
                    {course.description && (
                      <p className="max-w-xs truncate text-xs text-muted-foreground">
                        {course.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{course.branchName}</TableCell>
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {money(course.price)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {t("settings.courses.months", { count: course.durationMonths })}
                  </TableCell>
                  <TableCell>
                    {course.gradingSystemName ? (
                      <Badge variant="secondary">{course.gradingSystemName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("settings.courses.noGradingSystem")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {!course.isArchived && (
                      <RowActions
                        name={course.name}
                        onEdit={() => setDialog({ open: true, course })}
                        onDelete={() => setArchiving(course)}
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

      <CourseDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        course={dialog.course}
        branches={options}
        gradingSystems={gradingSystems}
        defaultBranchId={defaultId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={t("settings.courses.archiveTitle")}
        description={t("settings.courses.archiveText", { name: archiving?.name ?? "" })}
        confirmLabel={t("common.archive")}
        onConfirm={async () => {
          if (!archiving) return;
          await api(`/courses/${archiving.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
