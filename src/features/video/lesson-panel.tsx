"use client";

import {
  BookOpen,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Presentation,
  RefreshCw,
  Upload,
  Video,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { api, ApiError, uploadFile } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { materialView } from "@/lib/video-material";
import type { CallLessonDto } from "@/server/services/video/call-lesson.service";

import type { CallEngine } from "./call-engine";

/**
 * The lesson beside the call (A-154): today's topic, the lesson's and the
 * group's materials, and the homework. The teacher can set the topic here;
 * materials and homework are managed on the group page, which opens in a new tab.
 * The teacher can also put a material, or a file straight from the device, on
 * everyone's stage (A-183).
 */

/** What "show a file from this device" offers: the kinds the room can display itself. */
export const SHOWABLE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm";

export function LessonPanel({
  engine,
  onShown,
}: {
  engine: CallEngine;
  /** Called after the teacher put something on the stage, so a phone can close the panel. */
  onShown?: () => void;
}) {
  const t = useTranslations("video.lesson");
  const format = useFormatter();
  const [data, setData] = useState<CallLessonDto | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState("");
  const isHost = engine.self.role === "HOST";
  const isStudent = engine.self.role === "STUDENT";
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<"idle" | "busy" | "failed" | "type" | "size">("idle");
  const shownId = engine.currentStage.material?.id ?? null;

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

  /** A file from the teacher's device: saved as a material of the lesson, then shown. */
  const showFile = async (file: File | undefined) => {
    if (!file) return;
    setUpload("busy");
    try {
      const stored = await uploadFile(file, "/uploads/documents");
      const created = await api<{ id: string; title: string; url: string }>(
        `/groups/${engine.self.groupId}/materials`,
        {
          method: "POST",
          body: {
            lessonId: engine.self.lessonId,
            kind: "FILE",
            // "Unit 3.pdf" is shown as "Unit 3".
            title: (file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || file.name).slice(0, 200),
            url: stored.url,
          },
        },
      );
      engine.showMaterial({
        id: created.id,
        title: created.title,
        kind: "FILE",
        view: materialView("FILE", created.url),
        url: created.url,
      });
      setUpload("idle");
      load();
      onShown?.();
    } catch (e) {
      const key = e instanceof ApiError ? (e.fields?.file?.[0] ?? "") : "";
      setUpload(
        key.endsWith("attachmentType")
          ? "type"
          : key.endsWith("attachmentSize")
            ? "size"
            : "failed",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveNote = async () => {
    if (!data?.lesson) return;
    setSaving(true);
    try {
      await api(`/lessons/${data.lesson.id}`, {
        method: "PATCH",
        body: { studentNote: note.trim() || null },
      });
      setEditingNote(false);
      load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

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
            {/* The teacher's note to the students about this lesson (A-168). */}
            {(isHost || data.lesson.studentNote) && (
              <div className="mt-2 border-t border-sidebar pt-2" data-testid="lesson-note-block">
                {editingNote ? (
                  <form
                    className="space-y-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveNote();
                    }}
                  >
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      aria-label={t("studentNote")}
                      placeholder={t("studentNotePlaceholder")}
                      autoFocus
                      className="w-full rounded-md border border-sidebar bg-sidebar px-2.5 py-1.5 text-sm text-white placeholder:text-sidebar-foreground/60 focus-visible:outline-2 focus-visible:outline-sidebar-active"
                      data-testid="lesson-note-input"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-md bg-sidebar-active px-3 py-1.5 text-sm text-white hover:bg-sidebar-active/80 disabled:opacity-50"
                        data-testid="lesson-note-save"
                      >
                        {t("save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNote(false)}
                        className="rounded-md px-3 py-1.5 text-sm hover:bg-sidebar"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs">
                      <span className="font-semibold tracking-wide uppercase opacity-70">
                        {t("studentNote")}
                      </span>
                      <br />
                      <span
                        className={cn("text-sm", !data.lesson.studentNote && "opacity-60")}
                        data-testid="lesson-note"
                      >
                        {data.lesson.studentNote ?? t("noNote")}
                      </span>
                    </p>
                    {isHost && (
                      <button
                        type="button"
                        onClick={() => {
                          setNote(data.lesson?.studentNote ?? "");
                          setEditingNote(true);
                        }}
                        aria-label={t("editNote")}
                        title={t("editNote")}
                        className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-sidebar"
                        data-testid="lesson-note-edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
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
        {isHost && (
          <div className="mt-1.5 space-y-1">
            <input
              ref={fileRef}
              type="file"
              accept={SHOWABLE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void showFile(e.target.files?.[0])}
              data-testid="lesson-show-file-input"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload === "busy"}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-sidebar-active px-3 py-2 text-sm font-medium text-white hover:bg-sidebar-active/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
              data-testid="lesson-show-file"
            >
              <Upload className="size-4 shrink-0" />
              {upload === "busy" ? t("uploading") : t("showFile")}
            </button>
            <p
              className={cn("text-xs", upload === "idle" || upload === "busy" ? "opacity-60" : "")}
              role={upload === "idle" || upload === "busy" ? undefined : "alert"}
              data-testid="lesson-show-file-note"
            >
              {upload === "type"
                ? t("showFileType")
                : upload === "size"
                  ? t("showFileSize")
                  : upload === "failed"
                    ? t("showFileFailed")
                    : t("showFileHint")}
            </p>
          </div>
        )}
        {data.materials.length === 0 ? (
          <p className="mt-1 text-xs opacity-60">{t("noMaterials")}</p>
        ) : (
          <ul className="mt-1 space-y-1" data-testid="lesson-materials">
            {data.materials.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "flex items-center gap-1 rounded-md",
                  shownId === m.id && "bg-sidebar ring-1 ring-sidebar-active",
                )}
                data-testid="lesson-material"
                data-shown={shownId === m.id || undefined}
              >
                <a
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar"
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
                {isHost && (
                  <button
                    type="button"
                    onClick={() => {
                      if (shownId === m.id) {
                        engine.hideMaterial();
                        return;
                      }
                      engine.showMaterial({
                        id: m.id,
                        title: m.title,
                        kind: m.kind,
                        view: materialView(m.kind, m.url),
                        url: m.url,
                      });
                      onShown?.();
                    }}
                    aria-pressed={shownId === m.id}
                    aria-label={
                      shownId === m.id
                        ? t("stopShowing", { title: m.title })
                        : t("show", { title: m.title })
                    }
                    title={
                      shownId === m.id
                        ? t("stopShowing", { title: m.title })
                        : t("show", { title: m.title })
                    }
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-md hover:bg-sidebar hover:text-white focus-visible:outline-2 focus-visible:outline-sidebar-active pointer-coarse:size-10",
                      shownId === m.id && "text-sidebar-active",
                    )}
                    data-testid="lesson-material-show"
                  >
                    {shownId === m.id ? (
                      <X className="size-4" />
                    ) : (
                      <Presentation className="size-4" />
                    )}
                  </button>
                )}
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
