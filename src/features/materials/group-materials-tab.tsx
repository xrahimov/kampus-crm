"use client";

import { Download, ExternalLink, FileText, Link2, Plus, Trash2, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttachmentField } from "@/features/homework/attachment-field";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import type { GroupMaterialsDto, MaterialDto } from "@/server/services/materials/materials.service";

const NO_LESSON = "__none__";

export const KIND_ICON = { FILE: FileText, LINK: Link2, RECORDING: Video } as const;

/** Group → materials tab: files, links and call recordings by lesson (A-105). */
export function GroupMaterialsTab({
  groupId,
  data,
  canSet,
}: {
  groupId: string;
  data: GroupMaterialsDto;
  canSet: boolean;
}) {
  const t = useTranslations("groups.materials");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<MaterialDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => startTransition(() => router.refresh());
  const date = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  async function remove() {
    if (!deleting) return;
    setError(null);
    try {
      await api(`/materials/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    }
  }

  const groups = groupByLesson(data.items);

  return (
    <div className="space-y-4" data-testid="materials-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {canSet && (
          <Button size="sm" onClick={() => setAdding(true)} data-testid="material-add">
            <Plus /> {t("add")}
          </Button>
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
          {groups.map((g) => (
            <section key={g.key} className="rounded-lg border">
              <header className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">
                {g.lessonDate ? t("lessonOf", { date: date(g.lessonDate) }) : t("general")}
                {g.lessonTopic && (
                  <span className="ml-2 font-normal text-muted-foreground">{g.lessonTopic}</span>
                )}
              </header>
              <ul className="divide-y text-sm">
                {g.items.map((m) => (
                  <MaterialRow
                    key={m.id}
                    material={m}
                    canSet={canSet}
                    onDelete={() => setDeleting(m)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AddDialog
        open={adding}
        groupId={groupId}
        lessons={data.lessons}
        onOpenChange={setAdding}
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

/** Materials by lesson, newest lesson first, the group-wide ones last. */
export function groupByLesson<
  T extends Pick<MaterialDto, "lessonId" | "lessonDate" | "lessonTopic">,
>(items: T[]) {
  const map = new Map<
    string,
    { key: string; lessonDate: string | null; lessonTopic: string | null; items: T[] }
  >();
  for (const m of items) {
    const key = m.lessonId ?? NO_LESSON;
    const g = map.get(key) ?? {
      key,
      lessonDate: m.lessonDate,
      lessonTopic: m.lessonTopic,
      items: [],
    };
    g.items.push(m);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => {
    if (!a.lessonDate) return 1;
    if (!b.lessonDate) return -1;
    return b.lessonDate.localeCompare(a.lessonDate);
  });
}

export function describeMaterial(
  m: MaterialDto,
  t: (key: string, values?: Record<string, string | number>) => string,
): string[] {
  const parts: string[] = [];
  if (m.durationSec)
    parts.push(t("duration", { minutes: Math.max(1, Math.round(m.durationSec / 60)) }));
  if (m.size) parts.push(t("size", { mb: (m.size / 1024 / 1024).toFixed(1) }));
  return parts;
}

function MaterialRow({
  material: m,
  canSet,
  onDelete,
}: {
  material: MaterialDto;
  canSet: boolean;
  onDelete: () => void;
}) {
  const t = useTranslations("groups.materials");
  const Icon = KIND_ICON[m.kind];
  const meta = describeMaterial(m, t);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid="material-row">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={t(`kinds.${m.kind}`)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{m.title}</div>
        <div className="text-xs text-muted-foreground">
          {[
            t(`kinds.${m.kind}`),
            ...meta,
            m.createdByName && t("addedBy", { name: m.createdByName }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {m.kind === "RECORDING" && (
        <video
          controls
          preload="metadata"
          src={m.url}
          className="h-20 w-36 rounded-md bg-black"
          data-testid="material-video"
        />
      )}
      <a
        href={m.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs underline"
        {...(m.kind === "FILE" ? { download: "" } : {})}
      >
        {m.kind === "LINK" ? <ExternalLink className="size-3" /> : <Download className="size-3" />}
        {m.kind === "LINK" ? t("open") : t("download")}
      </a>
      {canSet && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={t("delete")}
          data-testid="material-delete"
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function AddDialog({
  open,
  groupId,
  lessons,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  groupId: string;
  lessons: GroupMaterialsDto["lessons"];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.materials");
  const fmt = useDateFormat();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const [kind, setKind] = useState<"FILE" | "LINK">("FILE");
  const [lessonId, setLessonId] = useState<string>(NO_LESSON);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setKind("FILE");
    setLessonId(lessons[0]?.id ?? NO_LESSON);
    setFileUrl(null);
    setFields({});
    setError(null);
    setFormKey((k) => k + 1);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/groups/${groupId}/materials`, {
        method: "POST",
        body: {
          lessonId: lessonId === NO_LESSON ? null : lessonId,
          kind,
          title: String(data.get("title") ?? ""),
          url: kind === "FILE" ? (fileUrl ?? "") : String(data.get("url") ?? "").trim(),
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
      title={t("addTitle")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="material-dialog"
    >
      <div key={formKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mt-kind">{t("kind")}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "FILE" | "LINK")}>
            <SelectTrigger id="mt-kind" data-testid="mt-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FILE">{t("kinds.FILE")}</SelectItem>
              <SelectItem value="LINK">{t("kinds.LINK")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mt-title">{t("title")}</Label>
          <Input id="mt-title" name="title" data-testid="mt-title" />
          <FieldError id="mt-title-error" message={fields.title?.[0]} />
        </div>
        {kind === "LINK" ? (
          <div className="space-y-2">
            <Label htmlFor="mt-url">{t("url")}</Label>
            <Input id="mt-url" name="url" type="url" placeholder="https://" data-testid="mt-url" />
            <FieldError id="mt-url-error" message={fields.url?.[0]} />
          </div>
        ) : (
          <>
            <AttachmentField id="mt-file" label={t("file")} value={fileUrl} onChange={setFileUrl} />
            <FieldError id="mt-file-error" message={fields.url?.[0]} />
          </>
        )}
        <div className="space-y-2">
          <Label htmlFor="mt-lesson">{t("lesson")}</Label>
          <Select value={lessonId} onValueChange={setLessonId}>
            <SelectTrigger id="mt-lesson" data-testid="mt-lesson">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LESSON}>{t("noLesson")}</SelectItem>
              {lessons.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {fmt(parseDateOnly(l.date), { dateStyle: "medium" })}
                  {l.topic ? ` · ${l.topic}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id="mt-lesson-error" message={fields.lessonId?.[0]} />
        </div>
      </div>
    </FormDialog>
  );
}
