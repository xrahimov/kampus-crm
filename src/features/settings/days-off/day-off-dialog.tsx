"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { dayOffSchema } from "@/lib/validation/settings";
import type { DayOffDto } from "@/server/services/settings/days-off.service";

import { BranchSelect, type BranchOption } from "../shared/branch-select";
import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof dayOffSchema>;
type Output = z.output<typeof dayOffSchema>;

export function DayOffDialog({
  open,
  onOpenChange,
  dayOff,
  branches,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOff: DayOffDto | null;
  branches: BranchOption[];
  defaultBranchId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.daysOff");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(dayOffSchema),
    defaultValues: { branchId: defaultBranchId, date: "", reason: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      dayOff
        ? { branchId: dayOff.branchId, date: dayOff.date, reason: dayOff.reason }
        : { branchId: defaultBranchId, date: "", reason: "" },
    );
  }, [open, dayOff, defaultBranchId, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (dayOff) {
        const { branchId: _branchId, ...rest } = values;
        await api(`/days-off/${dayOff.id}`, { method: "PATCH", body: rest });
      } else {
        await api("/days-off", { method: "POST", body: values });
      }
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
      title={dayOff ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="day-off-dialog"
    >
      {!dayOff && (
        <Controller
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <BranchSelect
              id="day-off-branch"
              branches={branches}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      )}
      <div className="space-y-2">
        <Label htmlFor="day-off-date">{t("date")}</Label>
        <Input
          id="day-off-date"
          type="date"
          aria-invalid={!!errors.date}
          {...form.register("date")}
        />
        <FieldError id="day-off-date-error" message={errors.date?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="day-off-reason">{t("reason")}</Label>
        <Textarea id="day-off-reason" aria-invalid={!!errors.reason} {...form.register("reason")} />
        <FieldError id="day-off-reason-error" message={errors.reason?.message} />
      </div>
    </FormDialog>
  );
}
