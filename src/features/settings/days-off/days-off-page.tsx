"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { SortHeader } from "@/components/data/sort-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import type { Page } from "@/lib/validation/common";
import type { DayOffDto } from "@/server/services/settings/days-off.service";

import { creatableBranches, type BranchOption } from "../shared/branch-select";
import { ListHeader } from "../shared/list-header";
import { RowActions } from "../shared/row-actions";
import { DayOffDialog } from "./day-off-dialog";

export function DaysOffPage({
  page,
  branches,
  actorBranchIds,
  activeBranchId,
  allBranches,
}: {
  page: Page<DayOffDto>;
  branches: BranchOption[];
  actorBranchIds: string[];
  activeBranchId: string | null;
  allBranches: boolean;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; dayOff: DayOffDto | null }>({
    open: false,
    dayOff: null,
  });
  const [deleting, setDeleting] = useState<DayOffDto | null>(null);
  const { options, defaultId } = creatableBranches(
    branches,
    actorBranchIds,
    activeBranchId,
    allBranches,
  );
  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("settings.daysOff.title")}
        description={t("settings.daysOff.description")}
        addLabel={t("settings.daysOff.add")}
        onAdd={() => setDialog({ open: true, dayOff: null })}
      />
      <Card>
        {page.items.length === 0 ? (
          <EmptyState title={t("common.nothingFound")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortHeader field="date">{t("settings.daysOff.date")}</SortHeader>
                </TableHead>
                <TableHead>{t("branch.select")}</TableHead>
                <TableHead>{t("settings.daysOff.reason")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((dayOff) => (
                <TableRow key={dayOff.id} data-testid="day-off-row">
                  <TableCell className="font-medium whitespace-nowrap">
                    {format.dateTime(parseDateOnly(dayOff.date), { dateStyle: "medium" })}
                  </TableCell>
                  <TableCell>{dayOff.branchName}</TableCell>
                  <TableCell className="max-w-md truncate">{dayOff.reason}</TableCell>
                  <TableCell>
                    <RowActions
                      name={dayOff.date}
                      onEdit={() => setDialog({ open: true, dayOff })}
                      onDelete={() => setDeleting(dayOff)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />

      <DayOffDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        dayOff={dialog.dayOff}
        branches={options}
        defaultBranchId={defaultId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("settings.daysOff.deleteTitle")}
        description={t("settings.daysOff.deleteText", { date: deleting?.date ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/days-off/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
