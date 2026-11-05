"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { ExercisesPanel } from "@/features/exercises/exercises-panel";
import { AttachmentField } from "@/features/homework/attachment-field";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { BLOCK_ICON, TopicBlockView } from "@/features/topics/topic-block-view";
import { api, ApiError } from "@/lib/api-client";
import {
  TOPIC_BLOCK_KINDS,
  TOPIC_BLOCKS_MAX,
  youtubeId,
  type TopicBlockKindInput,
} from "@/lib/validation/topic-content";
import type {
  TopicBlockDto,
  TopicContentDto,
} from "@/server/services/settings/topic-content.service";

type Draft = Omit<TopicBlockDto, "id" | "sortOrder"> & { key: number };

/**
 * The lesson content of one syllabus topic (A-157): the teacher (or the
 * office) adds text, a video, files and links in reading order; everyone else
 * sees what students will get.
 */
export function TopicContentDialog({
  topicId,
  onOpenChange,
  onSaved,
}: {
  topicId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.syllabus.content");
  const [loaded, setLoaded] = useState<{ topicId: string; data: TopicContentDto } | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [seq, setSeq] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  // The "add a block" form.
  const [kind, setKind] = useState<TopicBlockKindInput>("TEXT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const data = loaded && loaded.topicId === topicId ? loaded.data : null;
  useEffect(() => {
    if (!topicId) return;
    let live = true;
    api<TopicContentDto>(`/topics/${topicId}/content`)
      .then((content) => {
        if (!live) return;
        setLoaded({ topicId, data: content });
        setDraft(content.blocks.map((b, i) => ({ ...b, key: i + 1 })));
        setSeq(content.blocks.length + 1);
        setError(null);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => {
      live = false;
    };
  }, [topicId]);

  const resetAdd = () => {
    setTitle("");
    setBody("");
    setUrl("");
    setFileUrl(null);
    setFields({});
  };

  function addBlock() {
    const next: Draft = {
      key: seq,
      kind,
      title: title.trim(),
      body: kind === "TEXT" ? body.trim() : null,
      url:
        kind === "TEXT"
          ? null
          : kind === "LINK" || (kind === "VIDEO" && !fileUrl)
            ? url.trim()
            : fileUrl,
      size: null,
    };
    const problems: Record<string, string[]> = {};
    if (!next.title) problems.title = ["validation.required"];
    if (kind === "TEXT" && !next.body) problems.body = ["validation.required"];
    if (kind === "LINK" && !/^https?:\/\//i.test(next.url ?? "")) problems.url = ["validation.url"];
    if (kind === "FILE" && !next.url) problems.url = ["validation.fileRequired"];
    if (kind === "VIDEO" && !fileUrl && !youtubeId(next.url))
      problems.url = ["validation.videoUrl"];
    if (Object.keys(problems).length > 0) {
      setFields(problems);
      return;
    }
    setDraft((d) => [...d, next]);
    setSeq((s) => s + 1);
    resetAdd();
  }

  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const copy = [...d];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!topicId) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/topics/${topicId}/content`, {
        method: "PUT",
        body: {
          blocks: draft.map((b) => ({ kind: b.kind, title: b.title, body: b.body, url: b.url })),
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const canEdit = data?.canEdit ?? false;
  const field = "space-y-2";

  return (
    <FormDialog
      open={!!topicId}
      onOpenChange={onOpenChange}
      title={data ? t("title", { topic: data.title }) : t("loading")}
      description={canEdit ? t("hint") : t("readOnly")}
      onSubmit={submit}
      submitting={busy || !data || !canEdit}
      error={error}
      side="right"
      testId="topic-content-dialog"
    >
      {data && (
        <div className="space-y-5">
          {draft.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="topic-content-empty">
              {t("empty")}
            </p>
          ) : (
            <ol className="space-y-3" data-testid="topic-content-list">
              {draft.map((b, i) => {
                const Icon = BLOCK_ICON[b.kind];
                return (
                  <li
                    key={b.key}
                    className="rounded-md border p-3"
                    data-testid="topic-content-block"
                  >
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="size-3.5" aria-hidden />
                      <span className="flex-1">{t(`kinds.${b.kind}`)}</span>
                      {canEdit && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                            aria-label={t("moveUp")}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={i === draft.length - 1}
                            onClick={() => move(i, 1)}
                            aria-label={t("moveDown")}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive"
                            onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}
                            aria-label={t("remove")}
                            data-testid="topic-content-remove"
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                    <TopicBlockView block={{ ...b, id: String(b.key), sortOrder: i + 1 }} />
                  </li>
                );
              })}
            </ol>
          )}

          <ExercisesPanel anchor={{ topicId: data.topicId }} />

          {canEdit && draft.length < TOPIC_BLOCKS_MAX && (
            <fieldset className="space-y-3 rounded-md border border-dashed p-3">
              <legend className="px-1 text-sm font-medium">{t("add")}</legend>
              <div className={field}>
                <Label htmlFor="tc-kind">{t("kind")}</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as TopicBlockKindInput);
                    setFields({});
                  }}
                >
                  <SelectTrigger id="tc-kind" data-testid="tc-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPIC_BLOCK_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={field}>
                <Label htmlFor="tc-title">{t("blockTitle")}</Label>
                <Input
                  id="tc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  data-testid="tc-title"
                />
                <FieldError id="tc-title-error" message={fields.title?.[0]} />
              </div>
              {kind === "TEXT" && (
                <div className={field}>
                  <Label htmlFor="tc-body">{t("text")}</Label>
                  <Textarea
                    id="tc-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    data-testid="tc-body"
                  />
                  <FieldError id="tc-body-error" message={fields.body?.[0]} />
                </div>
              )}
              {(kind === "LINK" || kind === "VIDEO") && (
                <div className={field}>
                  <Label htmlFor="tc-url">{kind === "VIDEO" ? t("youtube") : t("url")}</Label>
                  <Input
                    id="tc-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={kind === "VIDEO" ? "https://youtu.be/…" : "https://"}
                    data-testid="tc-url"
                  />
                  <FieldError id="tc-url-error" message={fields.url?.[0]} />
                </div>
              )}
              {(kind === "FILE" || kind === "VIDEO") && (
                <>
                  <AttachmentField
                    id="tc-file"
                    label={kind === "VIDEO" ? t("videoFile") : t("file")}
                    value={fileUrl}
                    onChange={setFileUrl}
                  />
                  {kind === "FILE" && <FieldError id="tc-file-error" message={fields.url?.[0]} />}
                </>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBlock}
                data-testid="tc-add"
              >
                <Plus /> {t("addBlock")}
              </Button>
            </fieldset>
          )}
        </div>
      )}
    </FormDialog>
  );
}
