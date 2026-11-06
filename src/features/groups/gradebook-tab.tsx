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
import { Link } from "@/i18n/navigation";
import { GRADEBOOK_CATEGORIES } from "@/lib/validation/settings";
import type { GroupGradebookDto } from "@/server/services/gradebook/gradebook.service";

/** Group → Gradebook: each student's categories, weighted final grade and level (A-162). */
export function GradebookTab({
  data,
  canEditCourse,
}: {
  data: GroupGradebookDto;
  canEditCourse: boolean;
}) {
  const t = useTranslations("groups.gradebook");
  const ts = useTranslations("groups.memberStatuses");
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const shown = GRADEBOOK_CATEGORIES.filter((k) => data.weights[k] > 0);
  return (
    <div className="space-y-3" data-testid="gradebook-tab">
      <p className="text-sm text-muted-foreground">
        {t("intro", { course: data.courseName })}{" "}
        {data.scaleName ? t("scale", { name: data.scaleName }) : t("noScale")}{" "}
        {canEditCourse && (
          <Link href="/settings/courses" className="underline" data-testid="gradebook-weights-link">
            {t("changeWeights")}
          </Link>
        )}
      </p>
      {data.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("student")}</TableHead>
                {shown.map((k) => (
                  <TableHead key={k} className="text-right">
                    {t(`categories.${k}`)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t("weight", { percent: data.weights[k] })}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-right">{t("final")}</TableHead>
                <TableHead>{t("level")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.students.map((s) => (
                <TableRow key={s.membershipId} data-testid="gradebook-row">
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
                  {shown.map((k) => {
                    const c = s.categories.find((x) => x.key === k)!;
                    return (
                      <TableCell
                        key={k}
                        className="text-right tabular-nums"
                        title={t("items", { count: c.count })}
                        data-testid={`gradebook-${k}`}
                      >
                        {pct(c.percent)}
                      </TableCell>
                    );
                  })}
                  <TableCell
                    className="text-right font-semibold tabular-nums"
                    data-testid="gradebook-final"
                  >
                    {pct(s.final)}
                  </TableCell>
                  <TableCell data-testid="gradebook-level">
                    {s.level ? <Badge variant="secondary">{s.level}</Badge> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
