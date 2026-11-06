"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { MultiBars } from "@/features/reports/charts";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { ProgressMeter } from "@/features/progress/progress-meter";
import { BadgeList } from "@/features/badges/badge-list";
import type { BadgeDto } from "@/lib/validation/badges";
import type { StudentProgressDto } from "@/server/services/exams/exams.service";
import type { CourseProgressDto } from "@/server/services/progress/course-progress.service";

/**
 * Student profile → "O'quvchi progressi" (EXP §6): KPIs, the way through each
 * current course (A-159), monthly table, exam results.
 */
export function ProgressTab({
  progress,
  courses = [],
  badges = [],
}: {
  progress: StudentProgressDto;
  courses?: CourseProgressDto[];
  badges?: BadgeDto[];
}) {
  const t = useTranslations("students.progress");
  const te = useTranslations("exams");
  const tg = useTranslations("groups.memberStatuses");
  const fmt = useDateFormat();
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const num = (v: number | null) => (v === null ? "—" : String(v));
  const kpis: Array<[string, string]> = [
    [t("gradeAverage"), num(progress.gradeAverage)],
    [t("attendance"), pct(progress.attendancePercent)],
    [t("examAverage"), pct(progress.examAverage)],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold tabular-nums" data-testid="progress-kpi">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("byCourse")}</h3>
        {courses.filter((c) => c.topicsTotal > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noCourses")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("group")}</TableHead>
                <TableHead>{t("course")}</TableHead>
                <TableHead className="min-w-40">{t("complete")}</TableHead>
                <TableHead className="text-right">{t("topics")}</TableHead>
                <TableHead className="text-right">{t("exercises")}</TableHead>
                <TableHead className="text-right">{t("score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses
                .filter((c) => c.topicsTotal > 0)
                .map((c) => (
                  <TableRow key={c.membershipId} data-testid="progress-course-row">
                    <TableCell className="font-medium">
                      <Link href={`/groups/${c.groupId}`} className="hover:underline">
                        {c.groupName}
                      </Link>
                    </TableCell>
                    <TableCell>{c.courseName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressMeter percent={c.percent} className="w-24" />
                        <span className="tabular-nums">{pct(c.percent)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.topicsComplete}/{c.topicsTotal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.exercisesDone}/{c.exercisesTotal}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{pct(c.scorePercent)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("byMonth")}</h3>
        {progress.months.length > 0 && (
          <div data-testid="progress-chart">
            <MultiBars
              labels={[...progress.months]
                .reverse()
                .map((m) => fmt(parseDateOnly(`${m.month}-01`), { month: "short" }))}
              series={[
                {
                  name: t("attendance"),
                  values: [...progress.months].reverse().map((m) => m.attendancePercent ?? 0),
                },
                {
                  name: t("gradeAverage"),
                  values: [...progress.months].reverse().map((m) => m.gradeAverage ?? 0),
                },
              ]}
            />
          </div>
        )}
        {progress.months.length === 0 ? (
          <EmptyState title={t("noData")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("month")}</TableHead>
                <TableHead className="text-right">{t("lessons")}</TableHead>
                <TableHead className="text-right">{t("gradeAverage")}</TableHead>
                <TableHead className="text-right">{t("attendance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progress.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>
                    {fmt(parseDateOnly(`${m.month}-01`), { month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.lessons}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(m.gradeAverage)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(m.attendancePercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("byGroup")}</h3>
        {progress.byGroup.length === 0 ? (
          <EmptyState title={t("noData")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("group")}</TableHead>
                <TableHead>{t("course")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("lessons")}</TableHead>
                <TableHead className="text-right">{t("gradeAverage")}</TableHead>
                <TableHead className="text-right">{t("attendance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progress.byGroup.map((g) => (
                <TableRow key={g.groupId} data-testid="progress-group-row">
                  <TableCell className="font-medium">
                    <Link href={`/groups/${g.groupId}`} className="hover:underline">
                      {g.groupName}
                    </Link>
                  </TableCell>
                  <TableCell>{g.courseName}</TableCell>
                  <TableCell>{tg(g.status)}</TableCell>
                  <TableCell className="text-right tabular-nums">{g.lessons}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(g.gradeAverage)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(g.attendancePercent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {badges.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("badges")}</h3>
          <BadgeList badges={badges} testId="student-badges" />
        </section>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t("exams")}</h3>
        {progress.exams.length === 0 ? (
          <EmptyState title={t("noExams")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{te("columns.name")}</TableHead>
                <TableHead>{te("columns.date")}</TableHead>
                <TableHead>{te("columns.group")}</TableHead>
                <TableHead className="text-right">{te("results.score")}</TableHead>
                <TableHead>{te("results.level")}</TableHead>
                <TableHead>{te("results.result")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {progress.exams.map((e) => (
                <TableRow key={e.examId} data-testid="progress-exam-row">
                  <TableCell className="font-medium">
                    {e.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {te(`types.${e.type}`)}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {fmt(parseDateOnly(e.date), { dateStyle: "medium" })}
                  </TableCell>
                  <TableCell>{e.groupName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.score === null ? "—" : `${e.score} / ${e.maxScore}`}
                  </TableCell>
                  <TableCell>{e.level ?? "—"}</TableCell>
                  <TableCell>
                    {!e.isPresent ? (
                      <Badge variant="muted">{te("results.absent")}</Badge>
                    ) : e.passed === null ? (
                      <span className="text-muted-foreground">{te("results.notGraded")}</span>
                    ) : (
                      <Badge variant={e.passed ? "success" : "destructive"}>
                        {e.passed ? te("results.passed") : te("results.failed")}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
