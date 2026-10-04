"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { smsParts } from "@/features/sms/sms-counter";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { SMS_VARIABLES, smsTemplateSchema } from "@/lib/validation/integrations";
import type { SmsCategoryDto, SmsTemplateDto } from "@/server/services/sms/templates.service";

import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof smsTemplateSchema>;
type Output = z.output<typeof smsTemplateSchema>;

/** "SHABLON YARATISH" drawer (EXP §8): category, text, buttons that insert variables. */
export function SmsTemplateDialog({
  open,
  onOpenChange,
  template,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: SmsTemplateDto | null;
  categories: SmsCategoryDto[];
  onSaved: () => void;
}) {
  const t = useTranslations("sms.templates");
  const tv = useTranslations("sms.variables");
  const ts = useTranslations("sms.send");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(smsTemplateSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { categoryId: categories[0]?.id ?? "", text: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      categoryId: template?.categoryId ?? categories[0]?.id ?? "",
      text: template?.text ?? "",
    });
  }, [open, template, categories, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (template) await api(`/sms-templates/${template.id}`, { method: "PATCH", body: values });
      else await api("/sms-templates", { method: "POST", body: values });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const text = form.watch("text") ?? "";
  const { chars, parts } = smsParts(text);
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={template ? t("editTemplate") : t("addTemplate")}
      description={t("variablesHint")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      side="right"
      testId="sms-template-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="sms-template-category">{t("columns.category")}</Label>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="sms-template-category" aria-invalid={!!errors.categoryId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id="sms-template-category-error" message={errors.categoryId?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sms-template-text">{t("columns.text")}</Label>
        <Textarea
          id="sms-template-text"
          rows={6}
          aria-invalid={!!errors.text}
          {...form.register("text")}
        />
        <FieldError id="sms-template-text-error" message={errors.text?.message} />
        <p className="text-xs text-muted-foreground tabular-nums">
          {ts("counter", { chars, parts })}
        </p>
        <div className="flex flex-wrap gap-1">
          {SMS_VARIABLES.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                form.setValue("text", `${form.getValues("text") ?? ""}{${v}}`, {
                  shouldDirty: true,
                })
              }
              data-testid={`variable-${v}`}
            >
              {tv(v)}
            </Button>
          ))}
        </div>
      </div>
    </FormDialog>
  );
}
