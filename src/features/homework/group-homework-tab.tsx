"use client";

import {
  Check,
  ClipboardList,
  ExternalLink,
  ListChecks,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError, uploadFile } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { RubricCriterion } from "@/lib/validation/groups";
import type {
  GroupHomeworkDto,
  HomeworkDto,
  HomeworkSubmissionDto,
} from "@/server/services/homework/homework.service";

import { ExercisesDialog } from "@/features/exercises/exercises-dialog";
import { AssignmentDialog } from "./assignment-dialog";
import { AttachmentField } from "./attachment-field";
import { AudioPlayer, isAudioUrl } from "./audio-player";
import { AudioRecorder } from "./audio-recorder";

/**
 * Group → homework tab: one card per homework with every student's answer
 * (A-102), and standalone assignments with a rubric among them (A-161).
 */
export function GroupHomeworkTab({
  data,
  groupId,
  canSet,
}: {
  data: GroupHomeworkDto;
  groupId: string;
  canSet: boolean;
}) {
  const t = useTranslations("groups.homework");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<HomeworkDto | "new" | null>(null);
  const [assigning, setAssigning] = useState<HomeworkDto | "new" | null>(null);
  const [deleting, setDeleting] = useState<HomeworkDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  async function remove() {
    if (!deleting) return;
    setError(null);
    try {
      await api(`/homework/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  return (
    <div className="space-y-4" data-testid="homework-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {canSet && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAssigning("new")}
              data-testid="assignment-add"
            >
              <ClipboardList /> {t("assignment.add")}
            </Button>
            <Button size="sm" onClick={() => setEditing("new")} data-testid="homework-add">
              <Plus /> {t("add")}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t.has(error) ? t(error) : error}
        </p>
      )}
      {data.items.length === 0 ? (
        <EmptyState title={t("empty")} hint={canSet ? t("emptyHint") : undefined} />
      ) : (
        <div className="space-y-4">
          {data.items.map((hw) => (
            <HomeworkCard
              key={hw.id}
              homework={hw}
              canSet={canSet}
              onEdit={() => (hw.lessonId ? setEditing(hw) : setAssigning(hw))}
              onDelete={() => setDeleting(hw)}
              onChanged={refresh}
              date={date}
            />
          ))}
        </div>
      )}

      <HomeworkDialog
        open={editing !== null}
        homework={editing === "new" ? null : editing}
        lessons={data.lessons}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={refresh}
      />
      <AssignmentDialog
        open={assigning !== null}
        groupId={groupId}
        assignment={assigning === "new" ? null : assigning}
        onOpenChange={(open) => !open && setAssigning(null)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteText")}
        confirmLabel={t("delete")}
        onConfirm={remove}
      />
    </div>
  );
}

const STATUS_VARIANT = {
  SUBMITTED: "default",
  ACCEPTED: "success",
  RETURNED: "destructive",
} as const;

function HomeworkCard({
  homework,
  canSet,
  onEdit,
  onDelete,
  onChanged,
  date,
}: {
  homework: HomeworkDto;
  canSet: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
  date: (iso: string) => string;
}) {
  const t = useTranslations("groups.homework");
  const [reviewing, setReviewing] = useState<HomeworkSubmissionDto | null>(null);
  const [exercises, setExercises] = useState(false);
  const answered = homework.submissions.filter((s) => s.status !== null).length;
  const accepted = homework.submissions.filter((s) => s.status === "ACCEPTED").length;

  return (
    <article
      className="rounded-lg border"
      data-testid="homework-card"
      data-kind={homework.lessonId ? "lesson" : "assignment"}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/40 px-4 py-2">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {homework.lessonDate
              ? t("lessonOf", { date: date(homework.lessonDate) })
              : homework.title}
            {!homework.lessonId && (
              <Badge variant="secondary" data-testid="assignment-badge">
                <ClipboardList className="size-3" /> {t("assignment.badge")}
              </Badge>
            )}
            {homework.lessonTopic && (
              <span className="ml-2 font-normal text-muted-foreground">{homework.lessonTopic}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {homework.speaking && (
              <Badge variant="outline" data-testid="hw-speaking-badge">
                <Mic className="size-3" /> {t("speakingBadge")}
              </Badge>
            )}
            <span>
              {homework.dueDate && <span>{t("due", { date: date(homework.dueDate) })} · </span>}
              {homework.maxScore !== null && (
                <span>{t("assignment.outOf", { points: homework.maxScore })} · </span>
              )}
              {t("progress", { answered, accepted, total: homework.submissions.length })}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExercises(true)}
            data-testid="homework-exercises"
          >
            <ListChecks /> {t("exercises")}
          </Button>
          {canSet && (
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={t("edit")}>
              <Pencil />
            </Button>
          )}
          {canSet && (
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t("delete")}>
              <Trash2 />
            </Button>
          )}
        </div>
      </header>
      <ExercisesDialog
        open={exercises}
        onOpenChange={setExercises}
        anchor={{ homeworkId: homework.id }}
        title={
          homework.lessonDate
            ? t("exercisesTitle", { date: date(homework.lessonDate) })
            : t("exercisesTitleAssignment", { title: homework.title ?? "" })
        }
      />
      <div className="space-y-2 px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap">{homework.text}</p>
        {homework.rubric.length > 0 && <RubricList rubric={homework.rubric} />}
        <div className="flex flex-wrap gap-3 text-xs">
          {homework.linkUrl && (
            <a
              href={homework.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              <ExternalLink className="size-3" /> {t("link")}
            </a>
          )}
          {homework.attachmentUrl && (
            <a
              href={homework.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              <Paperclip className="size-3" /> {t("file")}
            </a>
          )}
        </div>
      </div>
      {homework.submissions.length > 0 && (
        <ul className="divide-y border-t text-sm">
          {homework.submissions.map((s) => (
            <li
              key={s.membershipId}
              className="flex flex-wrap items-center gap-2 px-4 py-2"
              data-testid="homework-row"
            >
              <span className="min-w-40 flex-1">{s.fullName}</span>
              {s.status ? (
                <Badge variant={STATUS_VARIANT[s.status]}>{t(`status.${s.status}`)}</Badge>
              ) : (
                <Badge variant="muted">{t("status.NONE")}</Badge>
              )}
              {s.note && (
                <span className="max-w-72 truncate text-muted-foreground" title={s.note}>
                  {s.note}
                </span>
              )}
              {s.attachmentUrl &&
                (isAudioUrl(s.attachmentUrl) ? (
                  <AudioPlayer src={s.attachmentUrl} testId="hw-row-audio" />
                ) : (
                  <a
                    href={s.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs underline"
                  >
                    <Paperclip className="size-3" /> {t("file")}
                  </a>
                ))}
              {s.score !== null && homework.maxScore !== null && (
                <span className="text-xs font-medium tabular-nums" data-testid="hw-row-score">
                  {s.score}/{homework.maxScore}
                </span>
              )}
              {s.teacherComment && (
                <span className="text-xs text-muted-foreground">“{s.teacherComment}”</span>
              )}
              {s.teacherAudioUrl && <AudioPlayer src={s.teacherAudioUrl} label={t("voiceReply")} />}
              {canSet && (
                <div className="ml-auto flex gap-1">
                  {s.status !== "ACCEPTED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewing(s)}
                      data-testid="homework-accept"
                    >
                      <Check /> {t("accept")}
                    </Button>
                  )}
                  {s.status === "ACCEPTED" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReviewing(s)}
                      data-testid="homework-return"
                    >
                      <Undo2 /> {t("return")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ReviewDialog
        homeworkId={homework.id}
        speaking={homework.speaking}
        rubric={homework.rubric}
        submission={reviewing}
        onOpenChange={(open) => !open && setReviewing(null)}
        onSaved={onChanged}
      />
    </article>
  );
}

function HomeworkDialog({
  open,
  homework,
  lessons,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  homework: HomeworkDto | null;
  lessons: GroupHomeworkDto["lessons"];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.homework");
  const fmt = useDateFormat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const [lessonId, setLessonId] = useState<string>("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Reset the form each time the dialog opens for a different homework.
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const current = homework?.id ?? null;
  if (open && seen !== current) {
    setSeen(current);
    setLessonId(homework?.lessonId ?? lessons.find((l) => !l.hasHomework)?.id ?? "");
    setAttachmentUrl(homework?.attachmentUrl ?? null);
    setSpeaking(homework?.speaking ?? false);
    setFields({});
    setError(null);
    setFormKey((k) => k + 1);
  } else if (!open && seen !== undefined) {
    setSeen(undefined);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const target = homework?.lessonId ?? lessonId;
    if (!target) {
      setFields({ lessonId: ["validation.required"] });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/lessons/${target}/homework`, {
        method: "PUT",
        body: {
          text: String(data.get("text") ?? ""),
          linkUrl: String(data.get("linkUrl") ?? "").trim() || null,
          attachmentUrl,
          speaking,
          dueDate: String(data.get("dueDate") ?? "") || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.fields ? null : e.message);
      } else setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={homework ? t("editTitle") : t("addTitle")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="homework-dialog"
    >
      <div key={formKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="hw-lesson">{t("lesson")}</Label>
          {homework ? (
            <Input
              id="hw-lesson"
              disabled
              value={`${fmt(parseDateOnly(homework.lessonDate ?? ""), { dateStyle: "medium" })}${
                homework.lessonTopic ? ` · ${homework.lessonTopic}` : ""
              }`}
            />
          ) : (
            <Select value={lessonId} onValueChange={setLessonId}>
              <SelectTrigger id="hw-lesson" data-testid="hw-lesson">
                <SelectValue placeholder={t("pickLesson")} />
              </SelectTrigger>
              <SelectContent>
                {lessons.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {fmt(parseDateOnly(l.date), { dateStyle: "medium" })}
                    {l.topic ? ` · ${l.topic}` : ""}
                    {l.hasHomework ? ` (${t("hasHomework")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldError id="hw-lesson-error" message={fields.lessonId?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hw-text">{t("text")}</Label>
          <Textarea
            id="hw-text"
            name="text"
            rows={4}
            defaultValue={homework?.text ?? ""}
            data-testid="hw-text"
          />
          <FieldError id="hw-text-error" message={fields.text?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hw-link">{t("linkUrl")}</Label>
          <Input id="hw-link" name="linkUrl" type="url" defaultValue={homework?.linkUrl ?? ""} />
          <FieldError id="hw-link-error" message={fields.linkUrl?.[0]} />
        </div>
        <AttachmentField
          id="hw-file"
          label={t("attachment")}
          value={attachmentUrl}
          onChange={setAttachmentUrl}
        />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={speaking}
            onCheckedChange={(v) => setSpeaking(v === true)}
            data-testid="hw-speaking"
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{t("speaking")}</span>
            <span className="block text-xs text-muted-foreground">{t("speakingHint")}</span>
          </span>
        </label>
        <div className="space-y-2">
          <Label htmlFor="hw-due">{t("dueDate")}</Label>
          <Input id="hw-due" name="dueDate" type="date" defaultValue={homework?.dueDate ?? ""} />
          <FieldError id="hw-due-error" message={fields.dueDate?.[0]} />
        </div>
      </div>
    </FormDialog>
  );
}

function ReviewDialog({
  homeworkId,
  speaking,
  rubric,
  submission,
  onOpenChange,
  onSaved,
}: {
  homeworkId: string;
  speaking: boolean;
  rubric: RubricCriterion[];
  submission: HomeworkSubmissionDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.homework");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<File | null>(null);
  const [points, setPoints] = useState<number[]>([]);
  const accepting = submission?.status !== "ACCEPTED";
  const maxScore = rubric.reduce((sum, c) => sum + c.max, 0);
  // Fresh points each time another answer opens: the stored ones, or zeros.
  const [seen, setSeen] = useState<string | null>(null);
  const key = submission ? submission.membershipId : null;
  if (key !== seen) {
    setSeen(key);
    setPoints(submission?.rubricScores ?? rubric.map(() => 0));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submission) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      // A new recording replaces the earlier spoken reply; none keeps it.
      const teacherAudioUrl = reply
        ? (await uploadFile(reply, "/uploads/documents")).url
        : undefined;
      await api(`/homework/${homeworkId}/submissions/${submission.membershipId}`, {
        method: "PATCH",
        body: {
          status: accepting ? "ACCEPTED" : "RETURNED",
          teacherComment: String(data.get("teacherComment") ?? "").trim() || null,
          ...(teacherAudioUrl ? { teacherAudioUrl } : {}),
          ...(rubric.length > 0 ? { rubricScores: points } : {}),
        },
      });
      setReply(null);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={submission !== null}
      onOpenChange={onOpenChange}
      title={accepting ? t("acceptTitle") : t("returnTitle")}
      description={submission?.fullName}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="review-dialog"
      submitLabel={accepting ? t("accept") : t("return")}
    >
      {submission?.note && (
        <p className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{submission.note}</p>
      )}
      {submission?.attachmentUrl &&
        (isAudioUrl(submission.attachmentUrl) ? (
          <AudioPlayer src={submission.attachmentUrl} testId="review-audio" />
        ) : (
          <a
            href={submission.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm underline"
          >
            <Paperclip className="size-3" /> {t("file")}
          </a>
        ))}
      {speaking && (
        <div className="space-y-1">
          <Label>{t("voiceReply")}</Label>
          {submission?.teacherAudioUrl && !reply && (
            <AudioPlayer src={submission.teacherAudioUrl} label={t("currentVoiceReply")} />
          )}
          <AudioRecorder value={reply} onChange={setReply} testId="reply-recorder" />
        </div>
      )}
      {rubric.length > 0 && (
        <fieldset className="space-y-2" data-testid="review-rubric">
          <legend className="text-sm font-medium">
            {t("assignment.score", { points: points.reduce((a, b) => a + b, 0), max: maxScore })}
          </legend>
          {rubric.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{c.name}</span>
              <Input
                type="number"
                min={0}
                max={c.max}
                value={points[i] ?? 0}
                onChange={(e) =>
                  setPoints((list) =>
                    rubric.map((_, j) =>
                      j === i
                        ? Math.max(0, Math.min(c.max, Number(e.target.value)))
                        : (list[j] ?? 0),
                    ),
                  )
                }
                className="w-20"
                aria-label={c.name}
                data-testid="review-points"
              />
              <span className="w-10 text-xs text-muted-foreground">/ {c.max}</span>
            </div>
          ))}
        </fieldset>
      )}
      <div className="space-y-2">
        <Label htmlFor="hw-comment">{t("teacherComment")}</Label>
        <Textarea
          id="hw-comment"
          name="teacherComment"
          rows={2}
          defaultValue={submission?.teacherComment ?? ""}
          key={submission?.membershipId}
        />
      </div>
    </FormDialog>
  );
}

/** The assignment's criteria and their points, as the students see them too. */
export function RubricList({ rubric }: { rubric: RubricCriterion[] }) {
  const t = useTranslations("groups.homework");
  return (
    <ul className="divide-y rounded-md border text-xs" data-testid="rubric-list">
      <li className="bg-muted/40 px-2 py-1 font-medium">{t("assignment.rubric")}</li>
      {rubric.map((c, i) => (
        <li key={i} className="flex justify-between gap-2 px-2 py-1">
          <span>{c.name}</span>
          <span className="tabular-nums text-muted-foreground">{c.max}</span>
        </li>
      ))}
    </ul>
  );
}
