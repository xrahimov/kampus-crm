"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormDialog as Dialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { leadFormSchema, type LeadFormInput } from "@/lib/validation/leads";
import type { LeadFormDto } from "@/server/services/leads/forms.service";
import type { LeadOptions } from "@/server/services/leads/leads.service";

type Input = z.input<typeof leadFormSchema>;
type Output = LeadFormInput;

const NONE = "__none";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** The reference's create form was not visible (EXP §8), so these fields mirror its columns (A-69). */
export function FormDialog({
  open,
  onOpenChange,
  form: existing,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadFormDto | null;
  options: LeadOptions;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("settings.forms");
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(leadFormSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: {
      name: "",
      slug: "",
      columnId: "",
      sourceId: "",
      integration: "",
      isActive: true,
    },
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSlugTouched(!!existing);
  }

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: existing?.name ?? "",
      slug: existing?.slug ?? "",
      columnId: existing?.columnId ?? options.boards[0]?.columns[0]?.id ?? "",
      sourceId: existing?.sourceId ?? "",
      integration: existing?.integration ?? "",
      isActive: existing?.isActive ?? true,
    });
  }, [open, existing, form, options.boards]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (existing) await api(`/lead-forms/${existing.id}`, { method: "PATCH", body: values });
      else await api("/lead-forms", { method: "POST", body: values });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={existing ? tf("edit") : tf("add")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="lead-form-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="form-name">{tf("name")}</Label>
        <Input
          id="form-name"
          aria-invalid={!!errors.name}
          {...form.register("name", {
            onChange: (e) => {
              if (!slugTouched) form.setValue("slug", slugify(e.target.value));
            },
          })}
        />
        <FieldError id="form-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-slug">{tf("slug")}</Label>
        <Input
          id="form-slug"
          aria-invalid={!!errors.slug}
          {...form.register("slug", { onChange: () => setSlugTouched(true) })}
        />
        <p className="text-xs text-muted-foreground">{tf("slugHint")}</p>
        <FieldError id="form-slug-error" message={errors.slug?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-column">{tf("column")}</Label>
        <Controller
          control={form.control}
          name="columnId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="form-column" aria-invalid={!!errors.columnId}>
                <SelectValue placeholder={tf("columnPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {options.boards.map((b) => (
                  <SelectGroup key={b.id}>
                    {b.columns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {b.name} · {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id="form-column-error" message={errors.columnId?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-source">{tf("source")}</Label>
        <Controller
          control={form.control}
          name="sourceId"
          render={({ field }) => (
            <Select
              value={field.value ? String(field.value) : NONE}
              onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
            >
              <SelectTrigger id="form-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>----</SelectItem>
                {options.sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-integration">{tf("integration")}</Label>
        <Input id="form-integration" {...form.register("integration")} />
        <p className="text-xs text-muted-foreground">{tf("integrationHint")}</p>
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
    </Dialog>
  );
}
