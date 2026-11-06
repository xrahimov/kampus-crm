"use client";

import { BookOpen, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type {
  GroupSyllabusDto,
  GroupSyllabusTopicDto,
} from "@/server/services/settings/syllabus.service";

import { TopicContentDialog } from "./topic-content-dialog";

/**
 * The group's progress through its course syllabus (A-137), and per topic the
 * lesson content students get and when they get it (A-157).
 */
export function SyllabusTab({
  data,
  groupId,
  canSet,
}: {
  data: GroupSyllabusDto;
  groupId: string;
  /** May open topics for the students (the attendance right of a live group). */
  canSet: boolean;
}) {
  const t = useTranslations("groups.syllabus");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const [contentOf, setContentOf] = useState<string | null>(null);
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setContentOf(topic.id)}
              data-testid="syllabus-content"
            >
              <BookOpen /> {t("content.button", { count: topic.blocks })}
            </Button>
            {topic.open ? (
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="syllabus-open"
              >
                <LockOpen className="size-3.5" aria-hidden /> {t("content.openNow")}
              </span>
            ) : null}
            {canSet && <ReleaseControl groupId={groupId} topic={topic} onSaved={refresh} />}
          </li>
        ))}
      </ol>
      <TopicContentDialog
        topicId={contentOf}
        onOpenChange={(open) => !open && setContentOf(null)}
        onSaved={refresh}
      />
    </div>
  );
}

/** When this group's students get the topic's content: after the lesson, now, or from a date. */
function ReleaseControl({
  groupId,
  topic,
  onSaved,
}: {
  groupId: string;
  topic: GroupSyllabusTopicDto;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.syllabus.content");
  const [date, setDate] = useState(topic.release.date ?? "");
  const [busy, setBusy] = useState(false);

  async function save(mode: "lesson" | "now" | "date", day = date) {
    if (mode === "date" && !day) return;
    setBusy(true);
    try {
      await api(`/groups/${groupId}/syllabus/${topic.id}/release`, {
        method: "PUT",
        body: { mode, date: mode === "date" ? day : null },
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <Select
        value={topic.release.mode}
        onValueChange={(v) => {
          if (v === "date") {
            if (date) void save("date");
          } else void save(v as "lesson" | "now");
        }}
        disabled={busy}
      >
        <SelectTrigger
          className="h-8 w-auto gap-1 text-xs"
          aria-label={t("release")}
          data-testid="syllabus-release"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="lesson">{t("modes.lesson")}</SelectItem>
          <SelectItem value="now">{t("modes.now")}</SelectItem>
          <SelectItem value="date" disabled={!date}>
            {t("modes.date")}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        onBlur={() => {
          if (date && date !== topic.release.date) void save("date", date);
        }}
        className="h-8 w-36 text-xs"
        aria-label={t("fromDate")}
        disabled={busy}
        data-testid="syllabus-release-date"
      />
    </span>
  );
}
