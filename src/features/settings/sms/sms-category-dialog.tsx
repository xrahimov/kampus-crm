"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { smsCategorySchema } from "@/lib/validation/integrations";

import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof smsCategorySchema>;
type Output = z.output<typeof smsCategorySchema>;

/** "KATEGORIYA YARATISH" (EXP §8 SMS templates): one field. */
export function SmsCategoryDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("sms.templates");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(smsCategorySchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (open) form.reset({ name: "" });
  }, [open, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      await api("/sms-categories", { method: "POST", body: values });
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
      title={t("addCategory")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="sms-category-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="sms-category-name">{t("categoryName")}</Label>
        <Input id="sms-category-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="sms-category-name-error" message={errors.name?.message} />
      </div>
    </FormDialog>
  );
}
