"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import type { CourseDto } from "@/server/services/settings/courses.service";
import type { CourseTopicDto } from "@/server/services/settings/syllabus.service";

import { FormDialog } from "../shared/form-dialog";

/**
 * The course's syllabus (A-137): one topic per line, in teaching order. Lines
 * that keep their text keep their row, so lessons already linked to a topic
 * stay linked when the list is reordered or extended.
 */
export function SyllabusDialog({
  course,
  onOpenChange,
  onSaved,
}: {
  course: CourseDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.courses");
  // Keyed by course so opening another course starts empty until its list arrives.
  const [loaded, setLoaded] = useState<{ courseId: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ courseId: string; message: string } | null>(null);

  const courseId = course?.id ?? null;
  const text = loaded && loaded.courseId === courseId ? loaded.text : null;
  const error = failure && failure.courseId === courseId ? failure.message : null;
  const setText = (value: string) => {
    if (courseId) setLoaded({ courseId, text: value });
  };
  useEffect(() => {
    if (!courseId) return;
    let live = true;
    api<CourseTopicDto[]>(`/courses/${courseId}/syllabus`)
      .then((rows) => {
        if (live) setLoaded({ courseId, text: rows.map((r) => r.title).join("\n") });
      })
      .catch((e: unknown) => {
        if (live) {
          setFailure({ courseId, message: e instanceof ApiError ? e.message : "errors.internal" });
        }
      });
    return () => {
      live = false;
    };
  }, [courseId]);

  const lines = (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseId || text === null) return;
    setBusy(true);
    setFailure(null);
    try {
      await api(`/courses/${courseId}/syllabus`, {
        method: "PUT",
        body: { topics: lines.map((title) => ({ title: title.slice(0, 200) })) },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setFailure({ courseId, message: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={!!course}
      onOpenChange={onOpenChange}
      title={course ? t("syllabusTitle", { name: course.name }) : ""}
      description={t("syllabusHint")}
      onSubmit={submit}
      submitting={busy || text === null}
      error={error}
      testId="syllabus-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="syllabus-topics">{t("syllabusTopics")}</Label>
        <Textarea
          id="syllabus-topics"
          value={text ?? ""}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          disabled={text === null}
          data-testid="syllabus-text"
        />
        <p className="text-xs text-muted-foreground" data-testid="syllabus-count">
          {t("syllabusCount", { count: lines.length })}
        </p>
      </div>
    </FormDialog>
  );
}
