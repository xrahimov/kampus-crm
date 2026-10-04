"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldError } from "@/components/data/field-error";
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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { TestAttemptDto, TestDetailDto } from "@/server/services/tests/tests.service";

/** "Natija kiritish" (A-82): pick the student, tick the chosen option per question. */
export function AttemptDialog({
  open,
  onOpenChange,
  test,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  test: TestDetailDto;
  onSaved: (attempt: TestAttemptDto) => void;
}) {
  const t = useTranslations("tests.detail");
  const [candidate, setCandidate] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCandidate("");
    setAnswers({});
    setMinutes("");
    setError(null);
    setFieldError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    const picked = test.candidates.find((c) => `${c.studentId}:${c.groupId}` === candidate);
    if (!picked) {
      setFieldError("validation.required");
      return;
    }
    setSubmitting(true);
    try {
      const saved = await api<TestAttemptDto>(`/tests/${test.id}/attempts`, {
        method: "POST",
        body: {
          studentId: picked.studentId,
          groupId: picked.groupId,
          answers,
          durationSeconds: minutes ? Number(minutes) * 60 : "",
        },
      });
      onOpenChange(false);
      reset();
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        setFieldError(Object.values(e.fields)[0]?.[0] ?? e.message);
      } else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("record")}
      description={test.name}
      onSubmit={submit}
      submitting={submitting}
      error={error}
      side="right"
      testId="attempt-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="attempt-student">{t("student")}</Label>
        <Select value={candidate || undefined} onValueChange={setCandidate}>
          <SelectTrigger id="attempt-student" data-testid="attempt-student">
            <SelectValue placeholder={t("pickStudent")} />
          </SelectTrigger>
          <SelectContent>
            {test.candidates.map((c) => (
              <SelectItem key={`${c.studentId}:${c.groupId}`} value={`${c.studentId}:${c.groupId}`}>
                {c.fullName} · {c.groupName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {test.candidates.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noCandidates")}</p>
        )}
        <FieldError id="attempt-student-error" message={fieldError ?? undefined} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="attempt-minutes">{t("durationMinutes")}</Label>
        <Input
          id="attempt-minutes"
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-32"
        />
      </div>
      <ol className="space-y-4">
        {test.questions.map((q, i) => (
          <li
            key={q.questionId}
            className="space-y-2 rounded-md border p-3"
            data-testid="attempt-question"
          >
            <div className="text-sm font-medium">
              {i + 1}. {q.text}
              <span className="ml-2 text-xs text-muted-foreground">
                {t("pointsShort", { count: q.points })}
              </span>
            </div>
            <RadioGroup
              value={q.questionId in answers ? String(answers[q.questionId]) : ""}
              onValueChange={(v) => setAnswers((a) => ({ ...a, [q.questionId]: Number(v) }))}
              className="space-y-1"
            >
              {q.options.map((opt, j) => (
                <label key={j} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={String(j)} aria-label={opt} />
                  {opt}
                </label>
              ))}
            </RadioGroup>
          </li>
        ))}
      </ol>
    </FormDialog>
  );
}
