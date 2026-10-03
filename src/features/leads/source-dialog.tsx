"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { leadSourceSchema } from "@/lib/validation/leads";
import type { LeadSourceDto } from "@/server/services/leads/sources.service";

type Input = z.input<typeof leadSourceSchema>;
type Output = z.output<typeof leadSourceSchema>;

/** "Yangi manba yaratish" drawer (EXP §3): name, plus an active switch of ours. */
export function SourceDialog({
  open,
  onOpenChange,
  source,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: LeadSourceDto | null;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const ts = useTranslations("leads.sourcesPage");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(leadSourceSchema),
    defaultValues: { name: "", isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ name: source?.name ?? "", isActive: source?.isActive ?? true });
  }, [open, source, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (source) await api(`/lead-sources/${source.id}`, { method: "PATCH", body: values });
      else await api("/lead-sources", { method: "POST", body: values });
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
      title={source ? ts("edit") : ts("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="source-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="source-name">{ts("name")}</Label>
        <Input id="source-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="source-name-error" message={errors.name?.message} />
      </div>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
            {t("common.active")}
          </label>
        )}
      />
    </FormDialog>
  );
}
