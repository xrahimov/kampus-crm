"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { schoolSchema } from "@/lib/validation/settings";
import type { SchoolDto } from "@/server/services/settings/schools.service";

import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof schoolSchema>;
type Output = z.output<typeof schoolSchema>;

export function SchoolDialog({
  open,
  onOpenChange,
  school,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolDto | null;
  onSaved: () => void;
}) {
  const t = useTranslations("settings.schools");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schoolSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ name: school?.name ?? "" });
  }, [open, school, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (school) await api(`/schools/${school.id}`, { method: "PATCH", body: values });
      else await api("/schools", { method: "POST", body: values });
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
      title={school ? t("edit") : t("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="school-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="school-name">{t("name")}</Label>
        <Input id="school-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="school-name-error" message={errors.name?.message} />
      </div>
    </FormDialog>
  );
}
