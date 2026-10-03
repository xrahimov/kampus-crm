"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, useRouter } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { ExamDto, ExamOptions } from "@/server/services/exams/exams.service";

import { ExamDialog } from "./exam-dialog";
import { ExamStatusBadge } from "./exams-page";

/** Group detail → IMTIHON tab (EXP §5): YARATISH and the group's exams. */
export function GroupExamsTab({
  groupId,
  exams,
  options,
  branches,
  canCreate,
}: {
  groupId: string;
  /** null when the schedule is hidden for this user (teachers, EXP §8 switch). */
  exams: ExamDto[] | null;
  options: ExamOptions | null;
  branches: BranchOption[];
  canCreate: boolean;
}) {
  const t = useTranslations();
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (exams === null) return <Alert>{t("exams.hidden")}</Alert>;

  return (
    <div className="space-y-3">
      {canCreate && options && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)} data-testid="group-exam-add">
            {t("exams.add")}
          </Button>
        </div>
      )}
      {exams.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("exams.columns.name")}</TableHead>
              <TableHead>{t("exams.columns.date")}</TableHead>
              <TableHead className="text-right">{t("exams.columns.passScore")}</TableHead>
              <TableHead className="text-right">{t("exams.columns.maxScore")}</TableHead>
              <TableHead>{t("exams.columns.room")}</TableHead>
              <TableHead>{t("exams.columns.time")}</TableHead>
              <TableHead>{t("exams.columns.examiner")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams.map((x) => (
              <TableRow key={x.id} data-testid="group-exam-row">
                <TableCell className="font-medium">
                  <Link href={`/exams/${x.id}`} className="hover:underline">
                    {x.name}
                  </Link>
                  {x.type === "MOCK" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("exams.types.MOCK")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {fmt(parseDateOnly(x.date), { dateStyle: "medium" })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{x.passScore}</TableCell>
                <TableCell className="text-right tabular-nums">{x.maxScore}</TableCell>
                <TableCell>{x.roomName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {x.startTime} – {x.endTime}
                </TableCell>
                <TableCell>{x.examinerName ?? "—"}</TableCell>
                <TableCell>
                  <ExamStatusBadge status={x.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {options && (
        <ExamDialog
          open={open}
          onOpenChange={setOpen}
          exam={null}
          options={options}
          branches={branches}
          fixedGroupId={groupId}
          defaultType="GROUP"
          onSaved={() => startTransition(() => router.refresh())}
        />
      )}
    </div>
  );
}
