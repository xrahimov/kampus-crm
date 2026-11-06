"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressMeter } from "@/features/progress/progress-meter";
import type { PortalGradebookDto } from "@/server/services/gradebook/gradebook.service";

/** The student's gradebook on their Results tab: categories, weights and the final grade (A-162). */
export function PortalGradebookCard({ data }: { data: PortalGradebookDto }) {
  const t = useTranslations("portal.gradebook");
  const shown = data.categories.filter((c) => c.weight > 0);
  return (
    <Card data-testid="portal-gradebook">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
          <span>{t("title", { course: data.courseName })}</span>
          <span
            className="flex items-center gap-2 tabular-nums"
            data-testid="portal-gradebook-final"
          >
            {data.final === null ? t("noGrade") : `${data.final}%`}
            {data.level && <Badge variant="secondary">{data.level}</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <ProgressMeter percent={data.final} label={t("final")} />
        <ul className="divide-y text-xs">
          {shown.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2 py-1">
              <span>
                {t(`categories.${c.key}`)}{" "}
                <span className="text-muted-foreground">
                  · {t("weight", { percent: c.weight })}
                </span>
              </span>
              <span className="tabular-nums" data-testid={`portal-gradebook-${c.key}`}>
                {c.percent === null ? t("none") : `${c.percent}%`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
    </Card>
  );
}
