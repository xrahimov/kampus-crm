"use client";

import { BookOpen, ExternalLink, FileText, Link2, Pencil, RefreshCw, Video } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { CallLessonDto } from "@/server/services/video/call-lesson.service";

import type { CallEngine } from "./call-engine";

/**
 * The lesson beside the call (A-154): today's topic, the lesson's and the
 * group's materials, and the homework. The teacher can set the topic here;
 * materials and homework are managed on the group page, which opens in a new tab.
 */
export function LessonPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.lesson");
  const format = useFormatter();
  const [data, setData] = useState<CallLessonDto | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const isHost = engine.self.role === "HOST";
  const isStudent = engine.self.role === "STUDENT";

  // Re-fetched when this counter moves (open, Refresh, after saving the topic).
  const [reloads, setReloads] = useState(0);
  const load = () => setReloads((n) => n + 1);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/video/peers/${engine.self.participantId}/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ secret: engine.self.secret }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as CallLessonDto;
      })
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError(false);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [engine, reloads]);

  const saveTopic = async () => {
    if (!data?.lesson) return;
    setSaving(true);
    try {
      await api(`/lessons/${data.lesson.id}`, {
        method: "PATCH",
        body: { topic: topic.trim() || null },
      });
      setEditing(false);
      load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-2 py-6 text-center text-sm">
        <p className="opacity-70">{t("failed")}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-md border border-sidebar px-3 py-1.5 text-sm hover:bg-sidebar"
        >
          <RefreshCw className="size-3.5" /> {t("retry")}
        </button>
      </div>
    );
  }
  if (!data) return <p className="py-6 text-center text-xs opacity-70">{t("loading")}</p>;

  const groupHref = (tab: string) => `/groups/${engine.self.groupId}?tab=${tab}`;
  const lessonTopic = data.lesson?.topic ?? data.lesson?.courseTopicTitle ?? null;

  return (
    <div className="space-y-4 text-sm" data-testid="lesson-body">
      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase opacity-70">
            {data.lesson
              ? t("lessonOf", {
                  date: format.dateTime(new Date(`${data.lesson.date}T00:00:00`), {
                    day: "numeric",
                    month: "short",
                  }),
                  time: data.lesson.startTime,
                })
              : t("noLesson")}
          </h3>
          <button
            type="button"
            onClick={load}
            aria-label={t("refresh")}
            title={t("refresh")}
            className="grid size-7 place-items-center rounded-md hover:bg-sidebar"
            data-testid="lesson-refresh"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
        {data.lesson && (
          <div className="mt-1">
            {editing ? (
              <form
                className="flex items-end gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTopic();
                }}
              >
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={500}
                  aria-label={t("topic")}
                  placeholder={t("topicPlaceholder")}
                  autoFocus
                  className="w-full rounded-md border border-sidebar bg-sidebar px-2.5 py-1.5 text-sm text-white placeholder:text-sidebar-foreground/60 focus-visible:outline-2 focus-visible:outline-sidebar-active"
                  data-testid="lesson-topic-input"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-sidebar-active px-3 py-1.5 text-sm text-white hover:bg-sidebar-active/80 disabled:opacity-50"
                  data-testid="lesson-topic-save"
                >
                  {t("save")}
                </button>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <p
                  className={cn("font-medium text-white", !lessonTopic && "font-normal opacity-60")}
                  data-testid="lesson-topic"
                >
                  {lessonTopic ?? t("noTopic")}
                </p>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => {
                      setTopic(data.lesson?.topic ?? "");
                      setEditing(true);
                    }}
                    aria-label={t("setTopic")}
                    title={t("setTopic")}
                    className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-sidebar"
                    data-testid="lesson-topic-edit"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
            )}
            {data.lesson.attachmentUrl && (
              <a
                href={data.lesson.attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
              >
                <FileText className="size-3.5" /> {t("lessonFile")}
              </a>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase opacity-70">
            {t("materials")}
          </h3>
          {!isStudent && (
            <a
              href={groupHref("materials")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs hover:underline"
            >
              {t("manage")} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {data.materials.length === 0 ? (
          <p className="mt-1 text-xs opacity-60">{t("noMaterials")}</p>
        ) : (
          <ul className="mt-1 space-y-1" data-testid="lesson-materials">
            {data.materials.map((m) => (
              <li key={m.id}>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar"
                >
                  {m.kind === "LINK" ? (
                    <Link2 className="size-3.5 shrink-0" />
                  ) : m.kind === "RECORDING" ? (
                    <Video className="size-3.5 shrink-0" />
                  ) : (
                    <FileText className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-white">{m.title}</span>
                  {m.general && <span className="shrink-0 text-xs opacity-60">{t("general")}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase opacity-70">
            {t("homework")}
          </h3>
          {!isStudent && data.lesson && (
            <a
              href={groupHref("homework")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs hover:underline"
            >
              {data.homework ? t("manage") : t("setHomework")} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        {data.homework ? (
          <div className="mt-1 space-y-1" data-testid="lesson-homework">
            <p className="whitespace-pre-wrap break-words text-white">{data.homework.text}</p>
            <div className="flex flex-wrap gap-3 text-xs">
              {data.homework.dueDate && (
                <span className="opacity-70">
                  {t("due", {
                    date: format.dateTime(new Date(`${data.homework.dueDate}T00:00:00`), {
                      day: "numeric",
                      month: "short",
                    }),
                  })}
                </span>
              )}
              {data.homework.linkUrl && (
                <a
                  href={data.homework.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <Link2 className="size-3" /> {t("link")}
                </a>
              )}
              {data.homework.attachmentUrl && (
                <a
                  href={data.homework.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <FileText className="size-3" /> {t("file")}
                </a>
              )}
              {data.homework.speaking && <span className="opacity-70">{t("speaking")}</span>}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs opacity-60">
            {data.lesson ? t("noHomework") : t("noLessonHomework")}
          </p>
        )}
      </section>

      {isStudent && (
        <p className="flex items-start gap-1.5 text-xs opacity-70">
          <BookOpen className="mt-0.5 size-3.5 shrink-0" /> {t("studentHint")}
        </p>
      )}
    </div>
  );
}
