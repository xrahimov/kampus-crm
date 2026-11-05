"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import {
  EXERCISE_ITEMS_MAX,
  EXERCISE_KINDS,
  exerciseItemSchema,
  GAP_MARK,
  type ExerciseItem,
  type ExerciseKind,
} from "@/lib/validation/exercises";
import type {
  ExerciseDto,
  ExerciseResultRowDto,
} from "@/server/services/exercises/exercises.service";

import { itemSummary } from "./item-summary";

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * The teacher writes or changes a self-check exercise (A-158): a title and a
 * list of items of six kinds, each with its answer key. An existing exercise
 * also shows how the students did.
 */
export function ExerciseDialog({
  open,
  anchor,
  exercise,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  anchor: { topicId?: string; homeworkId?: string };
  /** The exercise being edited, or null for a new one. */
  exercise: ExerciseDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("exercises");
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExerciseResultRowDto[] | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  // Fill the form each time the dialog opens; results load for an existing exercise.
  if (open && !wasOpen) {
    setWasOpen(true);
    setTitle(exercise?.title ?? "");
    setItems(exercise?.items ?? []);
    setError(null);
    setResults(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }
  const exerciseId = open ? (exercise?.id ?? null) : null;
  useEffect(() => {
    if (!exerciseId) return;
    let live = true;
    api<ExerciseResultRowDto[]>(`/exercises/${exerciseId}/results`)
      .then((rows) => live && setResults(rows))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [exerciseId]);

  const move = (i: number, dir: -1 | 1) =>
    setItems((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const copy = [...d];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Opened from inside the topic content dialog: the submit must not reach its form.
    event.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      if (exercise) {
        await api(`/exercises/${exercise.id}`, { method: "PUT", body: { title, items } });
      } else {
        await api("/exercises", { method: "POST", body: { title, items, ...anchor } });
      }
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
      open={open}
      onOpenChange={onOpenChange}
      title={exercise ? t("editTitle") : t("newTitle")}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy || !title.trim() || items.length === 0}
      error={error}
      side="right"
      testId="exercise-dialog"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="ex-title">{t("title")}</Label>
          <Input
            id="ex-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            data-testid="ex-title"
          />
        </div>

        {items.length > 0 && (
          <ol className="space-y-2" data-testid="ex-items">
            {items.map((item, i) => (
              <li key={i} className="rounded-md border p-3 text-sm" data-testid="ex-item">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{i + 1}.</span>
                  <Badge variant="outline">{t(`kinds.${item.kind}`)}</Badge>
                  <span className="flex-1" />
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
                    disabled={i === items.length - 1}
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
                    onClick={() => setItems((d) => d.filter((_, k) => k !== i))}
                    aria-label={t("remove")}
                    data-testid="ex-item-remove"
                  >
                    <Trash2 />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap">{item.prompt}</p>
                <p className="mt-1 text-xs text-muted-foreground">{itemSummary(item)}</p>
              </li>
            ))}
          </ol>
        )}

        {items.length < EXERCISE_ITEMS_MAX && (
          <AddItem onAdd={(item) => setItems((d) => [...d, item])} />
        )}

        {results && (
          <section className="space-y-2" data-testid="ex-results">
            <h3 className="text-sm font-medium">{t("results")}</h3>
            {results.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {results.map((r) => (
                  <li
                    key={r.studentId}
                    className="flex items-center justify-between gap-2 px-3 py-1.5"
                    data-testid="ex-result-row"
                  >
                    <span className="min-w-0 truncate">
                      {r.fullName}
                      <span className="ml-1 text-xs text-muted-foreground">{r.groupName}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {t("bestOf", {
                        score: r.bestScore,
                        max: r.maxScore,
                        percent: r.bestPercent,
                        attempts: r.attempts,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </FormDialog>
  );
}

/** The form for one new item; the kind decides which fields show. */
function AddItem({ onAdd }: { onAdd: (item: ExerciseItem) => void }) {
  const t = useTranslations("exercises");
  const [kind, setKind] = useState<ExerciseKind>("CHOICE");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [correct, setCorrect] = useState<number[]>([]);
  const [truth, setTruth] = useState<"true" | "false">("true");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | undefined>();

  const optionLines = lines(options);

  function build(): unknown {
    switch (kind) {
      case "CHOICE":
        return { kind, prompt, options: optionLines, correct };
      case "TRUE_FALSE":
        return { kind, prompt, correct: truth === "true" };
      case "GAP":
        return {
          kind,
          prompt,
          answers: lines(key).map((l) =>
            l
              .split("|")
              .map((a) => a.trim())
              .filter(Boolean),
          ),
        };
      case "MATCH":
        return {
          kind,
          prompt,
          pairs: lines(key).map((l) => {
            const [left, ...rest] = l.split("=");
            return { left: (left ?? "").trim(), right: rest.join("=").trim() };
          }),
        };
      case "ORDER":
        return { kind, prompt, items: lines(key) };
      case "SHORT":
        return { kind, prompt, answers: lines(key) };
    }
  }

  function add() {
    const parsed = exerciseItemSchema.safeParse(build());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "errors.validation");
      return;
    }
    onAdd(parsed.data);
    setPrompt("");
    setOptions("");
    setCorrect([]);
    setKey("");
    setError(undefined);
  }

  const field = "space-y-2";
  return (
    <fieldset className="space-y-3 rounded-md border border-dashed p-3">
      <legend className="px-1 text-sm font-medium">{t("addItem")}</legend>
      <div className={field}>
        <Label htmlFor="ex-kind">{t("kind")}</Label>
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as ExerciseKind);
            setError(undefined);
          }}
        >
          <SelectTrigger id="ex-kind" data-testid="ex-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`kinds.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t(`kindHints.${kind}`, { mark: GAP_MARK })}
        </p>
      </div>
      <div className={field}>
        <Label htmlFor="ex-prompt">{t("prompt")}</Label>
        <Textarea
          id="ex-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          data-testid="ex-prompt"
        />
      </div>
      {kind === "CHOICE" && (
        <div className={field}>
          <Label htmlFor="ex-options">{t("options")}</Label>
          <Textarea
            id="ex-options"
            value={options}
            onChange={(e) => {
              setOptions(e.target.value);
              setCorrect([]);
            }}
            rows={4}
            data-testid="ex-options"
          />
          {optionLines.length > 0 && (
            <ul className="space-y-1" data-testid="ex-correct">
              {optionLines.map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={`ex-correct-${i}`}
                    checked={correct.includes(i)}
                    onCheckedChange={(v) =>
                      setCorrect((c) =>
                        v ? [...c, i].sort((a, b) => a - b) : c.filter((x) => x !== i),
                      )
                    }
                  />
                  <Label htmlFor={`ex-correct-${i}`} className="font-normal">
                    {o}
                  </Label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t("tickCorrect")}</p>
        </div>
      )}
      {kind === "TRUE_FALSE" && (
        <RadioGroup
          value={truth}
          onValueChange={(v) => setTruth(v as "true" | "false")}
          className="flex gap-4"
          data-testid="ex-truth"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="true" id="ex-true" />
            <Label htmlFor="ex-true" className="font-normal">
              {t("true")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="false" id="ex-false" />
            <Label htmlFor="ex-false" className="font-normal">
              {t("false")}
            </Label>
          </div>
        </RadioGroup>
      )}
      {(kind === "GAP" || kind === "MATCH" || kind === "ORDER" || kind === "SHORT") && (
        <div className={field}>
          <Label htmlFor="ex-key">{t(`keyLabels.${kind}`)}</Label>
          <Textarea
            id="ex-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            rows={4}
            data-testid="ex-key"
          />
        </div>
      )}
      <FieldError id="ex-item-error" message={error} />
      <Button type="button" variant="outline" size="sm" onClick={add} data-testid="ex-add">
        <Plus /> {t("addToList")}
      </Button>
    </fieldset>
  );
}
