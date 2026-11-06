"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PortalExercises } from "@/features/exercises/exercise-runner";
import { ProgressMeter } from "@/features/progress/progress-meter";
import { TopicBlockView } from "@/features/topics/topic-block-view";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { CourseProgressDto } from "@/server/services/progress/course-progress.service";
import type { PortalCourseDto } from "@/server/services/settings/topic-content.service";

/**
 * The course's topics on the student's page: open ones unfold into their content
 * (A-157), with the student's own progress on top and per topic (A-159).
 */
export function PortalCourseTab({
  token,
  course,
  progress = null,
}: {
  token: string;
  course: PortalCourseDto;
  progress?: CourseProgressDto | null;
}) {
  const t = useTranslations("portal.course");
  const fmt = useDateFormat();
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  if (course.total === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  const firstOpen = course.topics.find(
    (x) => x.open && (x.blocks.length > 0 || x.exercises.length > 0),
  )?.id;
  const topicProgress = new Map(progress?.topics.map((t) => [t.topicId, t]) ?? []);
  return (
    <div className="space-y-3" data-testid="portal-course">
      {progress && progress.topicsTotal > 0 && (
        <Card data-testid="portal-progress">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{t("yourProgress")}</span>
              <span className="tabular-nums" data-testid="portal-progress-percent">
                {t("percent", { percent: progress.percent ?? 0 })}
              </span>
            </div>
            <ProgressMeter percent={progress.percent} label={t("yourProgress")} />
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("topicsDone", { done: progress.topicsComplete, total: progress.topicsTotal })}
              </span>
              {progress.exercisesTotal > 0 && (
                <span data-testid="portal-progress-exercises">
                  {t("exercisesDone", {
                    done: progress.exercisesDone,
                    total: progress.exercisesTotal,
                  })}
                </span>
              )}
              {progress.scorePercent !== null && (
                <span>{t("score", { score: progress.scorePercent })}</span>
              )}
              {progress.attendancePercent !== null && (
                <span>{t("attendance", { percent: progress.attendancePercent })}</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}
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
                  {topicProgress.get(topic.id)?.complete ? (
                    <Badge variant="success" data-testid="portal-topic-done">
                      {t("done")}
                    </Badge>
                  ) : topic.exercises.length > 0 &&
                    (topicProgress.get(topic.id)?.exercisesDone ?? 0) <
                      (topicProgress.get(topic.id)?.exercisesTotal ?? 0) ? (
                    <Badge variant="outline" data-testid="portal-topic-todo">
                      {t("toDo")}
                    </Badge>
                  ) : null}
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
