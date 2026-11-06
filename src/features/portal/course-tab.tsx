"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { PortalExercises } from "@/features/exercises/exercise-runner";
import { TopicBlockView } from "@/features/topics/topic-block-view";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { PortalCourseDto } from "@/server/services/settings/topic-content.service";

/** The course's topics on the student's page: open ones unfold into their content (A-157). */
export function PortalCourseTab({ token, course }: { token: string; course: PortalCourseDto }) {
  const t = useTranslations("portal.course");
  const fmt = useDateFormat();
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  if (course.total === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  const firstOpen = course.topics.find(
    (x) => x.open && (x.blocks.length > 0 || x.exercises.length > 0),
  )?.id;
  return (
    <div className="space-y-3" data-testid="portal-course">
      <p className="text-sm text-muted-foreground" data-testid="portal-course-progress">
        {t("progress", { open: course.open, total: course.total, course: course.courseName })}
      </p>
      <ol className="divide-y rounded-lg border">
        {course.topics.map((topic) =>
          topic.open ? (
            <li key={topic.id} data-testid="portal-topic" data-open="true">
              <details className="group" open={topic.id === firstOpen}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-6 text-right text-muted-foreground tabular-nums">
                    {topic.sortOrder}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{topic.title}</span>
                  {topic.coveredOn && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {t("coveredOn", { date: date(topic.coveredOn) })}
                    </span>
                  )}
                  {topic.blocks.length === 0 && topic.exercises.length === 0 ? (
                    <Badge variant="outline">{t("noContent")}</Badge>
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  )}
                </summary>
                {(topic.blocks.length > 0 || topic.exercises.length > 0) && (
                  <div
                    className="space-y-4 border-t bg-muted/30 px-3 py-3"
                    data-testid="portal-topic-content"
                  >
                    {topic.blocks.map((b) => (
                      <TopicBlockView key={b.id} block={b} />
                    ))}
                    <PortalExercises token={token} items={topic.exercises} />
                  </div>
                )}
              </details>
            </li>
          ) : (
            <li
              key={topic.id}
              className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground"
              data-testid="portal-topic"
              data-open="false"
            >
              <span className="w-6 text-right tabular-nums">{topic.sortOrder}</span>
              <span className="min-w-0 flex-1">{topic.title}</span>
              <span className="flex items-center gap-1 text-xs">
                <Lock className="size-3.5" aria-hidden />
                {topic.opensOn ? t("opensOn", { date: date(topic.opensOn) }) : t("locked")}
              </span>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
