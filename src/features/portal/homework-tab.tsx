"use client";

import { ExternalLink, Mic, Paperclip, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ATTACHMENT_ACCEPT } from "@/features/homework/attachment-field";
import { AudioPlayer, isAudioUrl } from "@/features/homework/audio-player";
import { AudioRecorder } from "@/features/homework/audio-recorder";
import type { ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { PortalHomeworkDto } from "@/server/services/homework/homework.service";

const STATUS_VARIANT = {
  SUBMITTED: "default",
  ACCEPTED: "success",
  RETURNED: "destructive",
} as const;

/** The student's homework list on their personal page, with a hand-in form per item. */
export function PortalHomeworkTab({
  token,
  initial,
}: {
  token: string;
  initial: PortalHomeworkDto[];
}) {
  const t = useTranslations("portal.homework");
  const [items, setItems] = useState(initial);

  async function reload() {
    const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}/homework`, {
      headers: { Accept: "application/json" },
    });
    if (response.ok) setItems((await response.json()) as PortalHomeworkDto[]);
  }

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return (
    <div className="space-y-4" data-testid="portal-homework">
      {items.map((hw) => (
        <HomeworkItem key={hw.id} token={token} homework={hw} onChanged={reload} />
      ))}
    </div>
  );
}

function HomeworkItem({
  token,
  homework,
  onChanged,
}: {
  token: string;
  homework: PortalHomeworkDto;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("portal.homework");
  const te = useTranslations();
  const fmt = useDateFormat();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<File | null>(null);
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });
  const s = homework.submission;
  const canAnswer = !s || s.status !== "ACCEPTED";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = fileRef.current?.files?.[0];
    if (!file) body.delete("file");
    // A recording made on the page goes instead of a picked file.
    if (recording) {
      body.delete("file");
      body.append("file", recording, recording.name);
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/public/class/${encodeURIComponent(token)}/homework/${homework.id}`,
        { method: "POST", headers: { Accept: "application/json" }, body },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
        const fields = payload?.error?.fields ?? {};
        setError(
          fields.note?.[0] ?? fields.file?.[0] ?? payload?.error?.message ?? "errors.internal",
        );
        return;
      }
      form.reset();
      setRecording(null);
      setOpen(false);
      await onChanged();
    } catch {
      setError("errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-lg border" data-testid="portal-homework-item">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-sm">
        <div className="font-medium">
          {t("lessonOf", { date: date(homework.lessonDate) })}
          {homework.lessonTopic && (
            <span className="ml-2 font-normal text-muted-foreground">{homework.lessonTopic}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {homework.speaking && (
            <Badge variant="outline" data-testid="portal-hw-speaking">
              <Mic className="size-3" /> {t("speaking")}
            </Badge>
          )}
          {homework.dueDate && (
            <span className="text-muted-foreground">
              {t("due", { date: date(homework.dueDate) })}
            </span>
          )}
          {s ? (
            <Badge variant={STATUS_VARIANT[s.status]}>{t(`status.${s.status}`)}</Badge>
          ) : (
            <Badge variant="muted">{t("status.NONE")}</Badge>
          )}
        </div>
      </header>
      <div className="space-y-3 px-3 py-3 text-sm">
        <p className="whitespace-pre-wrap">{homework.text}</p>
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
        {s && (
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs text-muted-foreground">
              {t("yourAnswer", { date: fmt(new Date(s.submittedAt), { dateStyle: "medium" }) })}
            </div>
            {s.note && <p className="whitespace-pre-wrap">{s.note}</p>}
            {s.attachmentUrl &&
              (isAudioUrl(s.attachmentUrl) ? (
                <AudioPlayer
                  src={s.attachmentUrl}
                  label={t("yourRecording")}
                  testId="portal-hw-audio"
                />
              ) : (
                <a
                  href={s.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline"
                >
                  <Paperclip className="size-3" /> {t("yourFile")}
                </a>
              ))}
            {s.teacherComment && (
              <p className="mt-2 border-t pt-2 text-xs">
                {t("teacherSaid")}: {s.teacherComment}
              </p>
            )}
            {s.teacherAudioUrl && (
              <div className="mt-2 border-t pt-2">
                <AudioPlayer
                  src={s.teacherAudioUrl}
                  label={t("teacherVoice")}
                  testId="portal-hw-teacher-audio"
                />
              </div>
            )}
          </div>
        )}
        {canAnswer && !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="hw-answer">
            <Send /> {s ? t("answerAgain") : t("answer")}
          </Button>
        )}
        {canAnswer && open && (
          <form onSubmit={submit} className="space-y-3" noValidate>
            {homework.speaking && (
              <div className="space-y-1">
                <Label>{t("recordAnswer")}</Label>
                <AudioRecorder value={recording} onChange={setRecording} testId="hw-recorder" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`note-${homework.id}`}>{t("note")}</Label>
              <Textarea
                id={`note-${homework.id}`}
                name="note"
                rows={3}
                defaultValue={s?.note ?? ""}
                data-testid="hw-note"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`file-${homework.id}`}>
                {homework.speaking ? t("audioFileOptional") : t("fileOptional")}
              </Label>
              <input
                ref={fileRef}
                id={`file-${homework.id}`}
                name="file"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-sm"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {te.has(error) ? te(error) : te("errors.internal")}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy} data-testid="hw-send">
                {busy ? t("sending") : t("send")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {te("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
