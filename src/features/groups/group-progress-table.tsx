"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProgressMeter } from "@/features/progress/progress-meter";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type {
  GroupProgressDto,
  TopicCell,
} from "@/server/services/progress/course-progress.service";

const CELL: Record<TopicCell, string> = {
  complete: "bg-primary",
  open: "bg-amber-400 dark:bg-amber-500",
  absent: "bg-destructive/70",
  planned: "bg-muted",
};

/** Each student's way through the course: a bar, the counts and one square per topic (A-159). */
export function GroupProgressTable({ data }: { data: GroupProgressDto }) {
  const t = useTranslations("groups.syllabus.students");
  const ts = useTranslations("groups.memberStatuses");
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  return (
    <section className="space-y-2" data-testid="group-progress">
      <div>
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </div>
      {data.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("student")}</TableHead>
                <TableHead className="min-w-40">{t("complete")}</TableHead>
                <TableHead className="text-right">{t("exercises")}</TableHead>
                <TableHead className="text-right">{t("score")}</TableHead>
                <TableHead className="text-right">{t("attendance")}</TableHead>
                <TableHead className="text-right">{t("homework")}</TableHead>
                <TableHead>{t("byTopic")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.students.map((s) => (
                <TableRow key={s.membershipId} data-testid="group-progress-row">
                  <TableCell className="font-medium">
                    <Link href={`/students/${s.studentId}`} className="hover:underline">
                      {s.fullName}
                    </Link>
                    {s.status !== "ACTIVE" && (
                      <Badge variant="outline" className="ml-2">
                        {ts(s.status)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProgressMeter percent={s.percent} className="w-24" label={t("complete")} />
                      <span className="tabular-nums" data-testid="group-progress-percent">
                        {pct(s.percent)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t("topics", { done: s.topicsComplete, total: s.topicsTotal })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.exercisesDone}/{s.exercisesTotal}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(s.scorePercent)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(s.attendancePercent)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.homeworkDone}/{s.homeworkSet}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.cells.map((cell, i) => (
                        <span
                          key={data.topics[i]?.id ?? i}
                          className={cn("size-3 rounded-sm", CELL[cell])}
                          title={`${data.topics[i]?.sortOrder ?? i + 1}. ${data.topics[i]?.title ?? ""}: ${t(`cell.${cell}`)}`}
                          data-testid="group-progress-cell"
                          data-state={cell}
                        />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
