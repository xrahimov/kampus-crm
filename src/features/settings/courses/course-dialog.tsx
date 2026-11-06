"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
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
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import {
  courseSchema,
  DEFAULT_GRADE_WEIGHTS,
  GRADEBOOK_CATEGORIES,
} from "@/lib/validation/settings";
import type { CourseDto } from "@/server/services/settings/courses.service";
import type { GradingSystemDto } from "@/server/services/settings/grading-systems.service";

import { BranchSelect, type BranchOption } from "../shared/branch-select";
import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof courseSchema>;
type Output = z.output<typeof courseSchema>;

const NONE = "__none__";
const DEFAULT_COLOR = "#0F766E";

export function CourseDialog({
  open,
  onOpenChange,
  course,
  branches,
  gradingSystems,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseDto | null;
  branches: BranchOption[];
  gradingSystems: GradingSystemDto[];
  defaultBranchId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.courses");
  const [error, setError] = useState<string | null>(null);

  const empty = (): Input => ({
    branchId: defaultBranchId,
    name: "",
    description: "",
    price: "",
    durationMonths: 1,
    gradingSystemId: null,
    color: DEFAULT_COLOR,
    gradeWeights: { ...DEFAULT_GRADE_WEIGHTS },
  });

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(courseSchema),
    defaultValues: empty(),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      course
        ? {
            branchId: course.branchId,
            name: course.name,
            description: course.description ?? "",
            price: course.price,
            durationMonths: course.durationMonths,
            gradingSystemId: course.gradingSystemId,
            color: course.color ?? DEFAULT_COLOR,
            gradeWeights: { ...(course.gradeWeights ?? DEFAULT_GRADE_WEIGHTS) },
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course, defaultBranchId]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (course) {
        const { branchId: _branchId, ...rest } = values;
        await api(`/courses/${course.id}`, { method: "PATCH", body: rest });
      } else {
        await api("/courses", { method: "POST", body: values });
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const weights = form.watch("gradeWeights");
  const weightSum = weights
    ? GRADEBOOK_CATEGORIES.reduce((sum, k) => sum + (Number(weights[k]) || 0), 0)
    : 0;
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={course ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="course-dialog"
    >
      {!course && (
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <BranchSelect
              id="course-branch"
              branches={branches}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      )}
      <div className="space-y-2">
        <Label htmlFor="course-name">{t("name")}</Label>
        <Input id="course-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="course-name-error" message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="course-price">{t("price")}</Label>
          <Input
            id="course-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            aria-invalid={!!errors.price}
            {...form.register("price")}
          />
          <FieldError id="course-price-error" message={errors.price?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="course-duration">{t("durationMonths")}</Label>
          <Input
            id="course-duration"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            aria-invalid={!!errors.durationMonths}
            {...form.register("durationMonths")}
          />
          <FieldError id="course-duration-error" message={errors.durationMonths?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="course-grading">{t("gradingSystem")}</Label>
          <Controller
            control={form.control}
            name="gradingSystemId"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : v)}
              >
                <SelectTrigger id="course-grading">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("noGradingSystem")}</SelectItem>
                  {gradingSystems.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="course-color">{t("color")}</Label>
          <Input
            id="course-color"
            type="color"
            className="h-9 w-full p-1"
            aria-invalid={!!errors.color}
            {...form.register("color")}
          />
          <FieldError id="course-color-error" message={errors.color?.message} />
        </div>
      </div>
      <fieldset className="space-y-2" data-testid="course-weights">
        <legend className="text-sm font-medium">{t("weights.title")}</legend>
        <p className="text-xs text-muted-foreground">{t("weights.hint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {GRADEBOOK_CATEGORIES.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`course-weight-${k}`} className="text-xs">
                {t(`weights.${k}`)}
              </Label>
              <Input
                id={`course-weight-${k}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                data-testid={`course-weight-${k}`}
                {...form.register(`gradeWeights.${k}`)}
              />
            </div>
          ))}
        </div>
        <p
          className={
            weightSum === 100 ? "text-xs text-muted-foreground" : "text-xs text-destructive"
          }
          data-testid="course-weights-sum"
        >
          {t("weights.sum", { sum: weightSum })}
        </p>
        <FieldError
          id="course-weights-error"
          message={errors.gradeWeights?.message ?? errors.gradeWeights?.root?.message}
        />
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="course-description">{t("description")}</Label>
        <Textarea id="course-description" {...form.register("description")} />
        <FieldError id="course-description-error" message={errors.description?.message} />
      </div>
    </FormDialog>
  );
}
