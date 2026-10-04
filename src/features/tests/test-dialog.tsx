"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { TEST_STATUSES, testSchema } from "@/lib/validation/tests";
import type { TestDetailDto, TestDto, TestOptions } from "@/server/services/tests/tests.service";

type Input = z.input<typeof testSchema>;
type Output = z.output<typeof testSchema>;

/**
 * "Yangi test yaratish" (EXP §8 Tests, not opened in the reference, A-81): name, subject,
 * time limit, pass mark, deadline, status, groups and question-bank picks with points.
 */
export function TestDialog({
  open,
  onOpenChange,
  test,
  options,
  fixedGroupId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Detail rows carry the questions; list rows start empty. */
  test: TestDto | TestDetailDto | null;
  options: TestOptions;
  fixedGroupId?: string;
  onSaved: (test: TestDto) => void;
}) {
  const t = useTranslations("tests");
  const tf = useTranslations("tests.form");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(testSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: {
      name: "",
      subject: "",
      timeLimitMinutes: "",
      passPercent: 60,
      deadline: "",
      status: "DRAFT",
      groupIds: [],
      questions: [],
    },
  });
  const subject = useWatch({ control: form.control, name: "subject" });
  const picked = useWatch({ control: form.control, name: "questions" }) ?? [];
  const hasAttempts = (test?.attemptCount ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const detail = test && "questions" in test ? test : null;
    form.reset({
      name: test?.name ?? "",
      subject: test?.subject ?? options.subjects[0] ?? "",
      timeLimitMinutes: test?.timeLimitMinutes ?? "",
      passPercent: test?.passPercent ?? 60,
      deadline: test?.deadline ?? "",
      status: test?.status ?? "DRAFT",
      groupIds: test ? test.groups.map((g) => g.id) : fixedGroupId ? [fixedGroupId] : [],
      questions: detail
        ? detail.questions.map((q) => ({ questionId: q.questionId, points: q.points }))
        : [],
    });
  }, [open, test, options.subjects, fixedGroupId, form]);

  const bank = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.questions.filter(
      (item) =>
        (!subject || item.subject === subject) &&
        (!q || item.text.toLowerCase().includes(q) || item.topic.toLowerCase().includes(q)),
    );
  }, [options.questions, subject, search]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      const saved = test
        ? await api<TestDto>(`/tests/${test.id}`, { method: "PATCH", body: values })
        : await api<TestDto>("/tests", { method: "POST", body: values });
      onOpenChange(false);
      onSaved(saved);
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setSearch("");
        }
        onOpenChange(next);
      }}
      title={test ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="test-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="test-name">{tf("name")}</Label>
        <Input id="test-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="test-name-error" message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="test-subject">{tf("subject")}</Label>
          <Input
            id="test-subject"
            list="test-subjects"
            aria-invalid={!!errors.subject}
            {...form.register("subject")}
          />
          <datalist id="test-subjects">
            {options.subjects.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <FieldError id="test-subject-error" message={errors.subject?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-status">{tf("status")}</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="test-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`statuses.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-time">{tf("timeLimit")}</Label>
          <Input id="test-time" type="number" min={1} {...form.register("timeLimitMinutes")} />
          <FieldError id="test-time-error" message={errors.timeLimitMinutes?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-pass">{tf("passPercent")}</Label>
          <Input
            id="test-pass"
            type="number"
            min={0}
            max={100}
            aria-invalid={!!errors.passPercent}
            {...form.register("passPercent")}
          />
          <FieldError id="test-pass-error" message={errors.passPercent?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-deadline">{tf("deadline")}</Label>
          <Input id="test-deadline" type="date" {...form.register("deadline")} />
          <FieldError id="test-deadline-error" message={errors.deadline?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{tf("groups")}</Label>
        <Controller
          control={form.control}
          name="groupIds"
          render={({ field }) => (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {options.groups.length === 0 && (
                <p className="text-xs text-muted-foreground">{tf("noGroups")}</p>
              )}
              {options.groups.map((g) => {
                const checked = (field.value ?? []).includes(g.id);
                return (
                  <label
                    key={g.id}
                    className="flex items-center gap-2 text-sm"
                    data-testid="test-group-option"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={g.id === fixedGroupId}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v
                            ? [...(field.value ?? []), g.id]
                            : (field.value ?? []).filter((id) => id !== g.id),
                        )
                      }
                    />
                    {g.name}
                  </label>
                );
              })}
            </div>
          )}
        />
        <FieldError id="test-groups-error" message={errors.groupIds?.message} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>
            {tf("questions")}{" "}
            <span className="text-muted-foreground" data-testid="picked-count">
              ({picked.length})
            </span>
          </Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tf("searchQuestions")}
            className="h-8 w-48"
            aria-label={tf("searchQuestions")}
          />
        </div>
        {hasAttempts && <p className="text-xs text-muted-foreground">{tf("lockedQuestions")}</p>}
        <Controller
          control={form.control}
          name="questions"
          render={({ field }) => {
            const list = field.value ?? [];
            return (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {bank.length === 0 && (
                  <p className="text-xs text-muted-foreground">{tf("noQuestions")}</p>
                )}
                {bank.map((q) => {
                  const index = list.findIndex((x) => x.questionId === q.id);
                  const checked = index >= 0;
                  return (
                    <div
                      key={q.id}
                      className="flex items-start gap-2 text-sm"
                      data-testid="bank-option"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        disabled={hasAttempts}
                        aria-label={q.text}
                        onCheckedChange={(v) =>
                          field.onChange(
                            v
                              ? [...list, { questionId: q.id, points: 1 }]
                              : list.filter((x) => x.questionId !== q.id),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{q.text}</div>
                        <div className="text-xs text-muted-foreground">{q.topic}</div>
                      </div>
                      {checked && (
                        <Input
                          type="number"
                          min={1}
                          aria-label={tf("points")}
                          disabled={hasAttempts}
                          className="h-7 w-16 tabular-nums"
                          value={Number(list[index]?.points ?? 1)}
                          onChange={(e) =>
                            field.onChange(
                              list.map((x, i) =>
                                i === index ? { ...x, points: Number(e.target.value) || 1 } : x,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }}
        />
        <FieldError
          id="test-questions-error"
          message={errors.questions?.message ?? errors.questions?.root?.message}
        />
      </div>
    </FormDialog>
  );
}
