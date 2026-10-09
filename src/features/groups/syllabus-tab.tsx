"use client";

import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { GroupSyllabusDto } from "@/server/services/settings/syllabus.service";

/** The group's progress through its course syllabus (A-137). */
export function SyllabusTab({ data }: { data: GroupSyllabusDto }) {
  const t = useTranslations("groups.syllabus");
  const fmt = useDateFormat();
  if (data.total === 0) {
    return <EmptyState title={t("empty")} />;
  }
  const percent = Math.round((data.done / data.total) * 100);
  return (
    <div className="space-y-4" data-testid="syllabus-tab">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium" data-testid="syllabus-progress">
            {t("progress", { done: data.done, total: data.total })}
          </p>
          {data.next && (
            <p className="text-sm text-muted-foreground" data-testid="syllabus-next">
              {t("next")}: <span className="text-foreground">{data.next.title}</span>
            </p>
          )}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ol className="divide-y rounded-md border">
        {data.topics.map((topic) => (
          <li
            key={topic.id}
            className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm"
            data-testid="syllabus-topic"
            data-status={topic.status}
          >
            <span className="w-6 text-right text-muted-foreground tabular-nums">
              {topic.sortOrder}
            </span>
            <span className="min-w-0 flex-1">
              <span className={topic.status === "done" ? "text-muted-foreground" : undefined}>
                {topic.title}
              </span>
              {topic.note && (
                <span className="block text-xs text-muted-foreground">{topic.note}</span>
              )}
            </span>
            {topic.status === "done" && topic.lessonDate ? (
              <span className="text-xs text-muted-foreground">
                {t("coveredOn", {
                  date: fmt(parseDateOnly(topic.lessonDate), { day: "numeric", month: "short" }),
                })}
              </span>
            ) : null}
            <Badge
              variant={
                topic.status === "done"
                  ? "success"
                  : topic.status === "next"
                    ? "default"
                    : "outline"
              }
            >
              {t(`status.${topic.status}`)}
            </Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}
