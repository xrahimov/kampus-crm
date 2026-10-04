"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { MAX_OPTIONS, MIN_OPTIONS, questionSchema } from "@/lib/validation/tests";
import type { QuestionDto } from "@/server/services/tests/questions.service";

type Input = z.input<typeof questionSchema>;
type Output = z.output<typeof questionSchema>;

/** Question bank item: subject, topic, text, 2–6 options and the correct one (A-81). */
export function QuestionDialog({
  open,
  onOpenChange,
  question,
  subjects,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question: QuestionDto | null;
  subjects: string[];
  onSaved: () => void;
}) {
  const t = useTranslations("tests.questionForm");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(questionSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { subject: "", topic: "", text: "", options: ["", ""], correctIndex: 0 },
  });
  // Options are strings, so the field array works on `{ value }` wrappers.
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "options" as never,
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      subject: question?.subject ?? subjects[0] ?? "",
      topic: question?.topic ?? "",
      text: question?.text ?? "",
      options: question?.options ?? ["", ""],
      correctIndex: question?.correctIndex ?? 0,
    });
  }, [open, question, subjects, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (question) await api(`/question-bank/${question.id}`, { method: "PATCH", body: values });
      else await api("/question-bank", { method: "POST", body: values });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={question ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="question-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="q-subject">{t("subject")}</Label>
          <Input
            id="q-subject"
            list="q-subjects"
            aria-invalid={!!errors.subject}
            {...form.register("subject")}
          />
          <datalist id="q-subjects">
            {subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <FieldError id="q-subject-error" message={errors.subject?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q-topic">{t("topic")}</Label>
          <Input id="q-topic" aria-invalid={!!errors.topic} {...form.register("topic")} />
          <FieldError id="q-topic-error" message={errors.topic?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="q-text">{t("text")}</Label>
        <Textarea id="q-text" rows={3} aria-invalid={!!errors.text} {...form.register("text")} />
        <FieldError id="q-text-error" message={errors.text?.message} />
      </div>
      <div className="space-y-2">
        <Label>{t("options")}</Label>
        <p className="text-xs text-muted-foreground">{t("optionsHint")}</p>
        <Controller
          control={form.control}
          name="correctIndex"
          render={({ field }) => (
            <RadioGroup
              value={String(field.value ?? 0)}
              onValueChange={(v) => field.onChange(Number(v))}
              className="space-y-2"
            >
              {fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2" data-testid="option-row">
                  <RadioGroupItem
                    value={String(i)}
                    id={`q-correct-${i}`}
                    aria-label={t("correct")}
                  />
                  <Input
                    aria-label={t("optionN", { n: i + 1 })}
                    placeholder={t("optionN", { n: i + 1 })}
                    {...form.register(`options.${i}` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length <= MIN_OPTIONS}
                    onClick={() => {
                      remove(i);
                      if (Number(field.value ?? 0) >= fields.length - 1) field.onChange(0);
                    }}
                    aria-label={t("removeOption")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= MAX_OPTIONS}
          onClick={() => append("" as never)}
          data-testid="add-option"
        >
          <Plus /> {t("addOption")}
        </Button>
        <FieldError
          id="q-options-error"
          message={
            errors.options?.message ?? errors.options?.root?.message ?? errors.correctIndex?.message
          }
        />
      </div>
    </FormDialog>
  );
}
