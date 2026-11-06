"use client";

import { ArrowDown, ArrowUp, Check, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ApiErrorBody } from "@/lib/api-client";
import { GAP_MARK, type ExerciseAnswer } from "@/lib/validation/exercises";
import type {
  PortalExerciseDto,
  PortalExerciseItem,
  PortalExerciseResultDto,
  PortalExerciseSummaryDto,
} from "@/server/services/exercises/exercises.service";

/*
 * A self-check exercise on the student's page (A-158): the list entry with the
 * best go so far, the form for one go, and the result with the key.
 */

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return payload?.error?.message ?? "errors.internal";
}

export function PortalExercises({
  token,
  items,
  onChanged,
}: {
  token: string;
  items: PortalExerciseSummaryDto[];
  onChanged?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" data-testid="portal-exercises">
      {items.map((ex) => (
        <ExerciseEntry key={ex.id} token={token} summary={ex} onChanged={onChanged} />
      ))}
    </ul>
  );
}

function ExerciseEntry({
  token,
  summary,
  onChanged,
}: {
  token: string;
  summary: PortalExerciseSummaryDto;
  onChanged?: () => void;
}) {
  const t = useTranslations("portal.exercises");
  const te = useTranslations();
  const [run, setRun] = useState<PortalExerciseDto | null>(null);
  const [result, setResult] = useState<PortalExerciseResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/public/class/${encodeURIComponent(token)}/exercises/${summary.id}`;
  // The best go so far, kept after the result view is closed.
  const [best, setBest] = useState(summary.best);

  async function start() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(base, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      setRun((await response.json()) as PortalExerciseDto);
    } finally {
      setBusy(false);
    }
  }

  async function submit(answers: Record<string, ExerciseAnswer>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const outcome = (await response.json()) as PortalExerciseResultDto;
      setResult(outcome);
      setBest(outcome.best);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border p-3 text-sm" data-testid="portal-exercise">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 font-medium">{summary.title}</span>
        <span className="text-xs text-muted-foreground">
          {t("items", { count: summary.itemCount })}
        </span>
        {best && (
          <Badge
            variant={best.percent >= 70 ? "success" : "outline"}
            data-testid="portal-exercise-best"
          >
            {t("best", { score: best.score, max: best.maxScore, percent: best.percent })}
          </Badge>
        )}
        {!run && (
          <Button
            size="sm"
            variant="outline"
            onClick={start}
            disabled={busy}
            data-testid="exercise-start"
          >
            {best ? t("again") : t("start")}
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-destructive">
          {te.has(error) ? te(error) : te("errors.internal")}
        </p>
      )}
      {run && !result && (
        <RunForm run={run} busy={busy} onSubmit={submit} onCancel={() => setRun(null)} />
      )}
      {run && result && (
        <div className="mt-3 space-y-3" data-testid="exercise-result">
          <p className="font-medium" data-testid="exercise-score">
            {t("score", { score: result.score, max: result.maxScore, percent: result.percent })}
          </p>
          <ol className="space-y-2">
            {run.items.map((item, i) => {
              const r = result.items[i]!;
              return (
                <li
                  key={i}
                  className="flex gap-2"
                  data-testid="exercise-item-result"
                  data-correct={r.correct}
                >
                  {r.correct ? (
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      aria-label={t("right")}
                    />
                  ) : (
                    <X
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-label={t("wrong")}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p>{item.prompt}</p>
                    {!r.correct && (
                      <p className="text-xs text-muted-foreground">
                        {t("key")}: {r.key.join(", ")}
                      </p>
                    )}
                    {r.max > 1 && (
                      <p className="text-xs text-muted-foreground">
                        {t("partial", { points: r.points, max: r.max })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setResult(null);
              setRun(null);
            }}
            data-testid="exercise-done"
          >
            <RotateCcw /> {t("close")}
          </Button>
        </div>
      )}
    </li>
  );
}

function RunForm({
  run,
  busy,
  onSubmit,
  onCancel,
}: {
  run: PortalExerciseDto;
  busy: boolean;
  onSubmit: (answers: Record<string, ExerciseAnswer>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("portal.exercises");
  const [answers, setAnswers] = useState<Record<string, ExerciseAnswer>>(() => {
    const init: Record<string, ExerciseAnswer> = {};
    run.items.forEach((item, i) => {
      if (item.kind === "ORDER") init[String(i)] = item.pieces;
    });
    return init;
  });
  const set = (i: number, value: ExerciseAnswer) =>
    setAnswers((a) => ({ ...a, [String(i)]: value }));

  return (
    <form
      className="mt-3 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(answers);
      }}
      data-testid="exercise-form"
    >
      {run.items.map((item, i) => (
        <fieldset key={i} className="space-y-2" data-testid="exercise-item" data-kind={item.kind}>
          <legend className="text-sm font-medium">
            {i + 1}. {item.kind === "GAP" ? null : item.prompt}
          </legend>
          <ItemInput
            id={`ex-${run.id}-${i}`}
            item={item}
            value={answers[String(i)]}
            onChange={(v) => set(i, v)}
          />
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy} data-testid="exercise-submit">
          {t("check")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function ItemInput({
  id,
  item,
  value,
  onChange,
}: {
  id: string;
  item: PortalExerciseItem;
  value: ExerciseAnswer | undefined;
  onChange: (value: ExerciseAnswer) => void;
}) {
  const t = useTranslations("portal.exercises");
  switch (item.kind) {
    case "CHOICE": {
      const chosen = Array.isArray(value) ? (value as number[]) : [];
      if (item.multiple) {
        return (
          <ul className="space-y-1">
            {item.options.map((o, k) => (
              <li key={k} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${k}`}
                  checked={chosen.includes(k)}
                  onCheckedChange={(v) =>
                    onChange(
                      v ? [...chosen, k].sort((a, b) => a - b) : chosen.filter((x) => x !== k),
                    )
                  }
                />
                <Label htmlFor={`${id}-${k}`} className="font-normal">
                  {o}
                </Label>
              </li>
            ))}
          </ul>
        );
      }
      return (
        <RadioGroup
          value={chosen[0] !== undefined ? String(chosen[0]) : ""}
          onValueChange={(v) => onChange([Number(v)])}
        >
          {item.options.map((o, k) => (
            <div key={k} className="flex items-center gap-2">
              <RadioGroupItem value={String(k)} id={`${id}-${k}`} />
              <Label htmlFor={`${id}-${k}`} className="font-normal">
                {o}
              </Label>
            </div>
          ))}
        </RadioGroup>
      );
    }
    case "TRUE_FALSE":
      return (
        <RadioGroup
          value={typeof value === "boolean" ? String(value) : ""}
          onValueChange={(v) => onChange(v === "true")}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="true" id={`${id}-t`} />
            <Label htmlFor={`${id}-t`} className="font-normal">
              {t("true")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="false" id={`${id}-f`} />
            <Label htmlFor={`${id}-f`} className="font-normal">
              {t("false")}
            </Label>
          </div>
        </RadioGroup>
      );
    case "GAP": {
      const parts = item.prompt.split(GAP_MARK);
      const given = Array.isArray(value) ? (value as string[]) : [];
      return (
        <p className="flex flex-wrap items-center gap-1 leading-8">
          {parts.map((part, k) => (
            <span key={k} className="contents">
              <span>{part}</span>
              {k < parts.length - 1 && (
                <Input
                  value={given[k] ?? ""}
                  onChange={(e) => {
                    const next = [...given];
                    for (let z = 0; z < item.gaps; z++) next[z] = next[z] ?? "";
                    next[k] = e.target.value;
                    onChange(next);
                  }}
                  aria-label={t("gap", { number: k + 1 })}
                  className="inline-block h-8 w-32"
                  data-testid="exercise-gap"
                />
              )}
            </span>
          ))}
        </p>
      );
    }
    case "MATCH": {
      const given = Array.isArray(value) ? (value as string[]) : [];
      return (
        <ul className="space-y-1">
          {item.lefts.map((left, k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">{left}</span>
              <select
                value={given[k] ?? ""}
                onChange={(e) => {
                  const next = [...given];
                  for (let z = 0; z < item.lefts.length; z++) next[z] = next[z] ?? "";
                  next[k] = e.target.value;
                  onChange(next);
                }}
                aria-label={t("matchFor", { left })}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                data-testid="exercise-match"
              >
                <option value="">…</option>
                {item.rights.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      );
    }
    case "ORDER": {
      const order = Array.isArray(value) ? (value as string[]) : item.pieces;
      const move = (k: number, dir: -1 | 1) => {
        const j = k + dir;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[k], next[j]] = [next[j]!, next[k]!];
        onChange(next);
      };
      return (
        <ol className="space-y-1" data-testid="exercise-order">
          {order.map((piece, k) => (
            <li key={piece} className="flex items-center gap-1 rounded-md border px-2 py-1">
              <span className="min-w-0 flex-1">{piece}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={k === 0}
                onClick={() => move(k, -1)}
                aria-label={t("up")}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={k === order.length - 1}
                onClick={() => move(k, 1)}
                aria-label={t("down")}
              >
                <ArrowDown />
              </Button>
            </li>
          ))}
        </ol>
      );
    }
    case "SHORT":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t("yourAnswer")}
          className="max-w-sm"
          data-testid="exercise-short"
        />
      );
  }
}
