"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { coinReasonSchema } from "@/lib/validation/coins";
import type { CoinReasonDto } from "@/server/services/coins/coins.service";

import { FormDialog } from "../shared/form-dialog";

type Input = z.input<typeof coinReasonSchema>;
type Output = z.output<typeof coinReasonSchema>;

/** "SABAB QO'SHISH" (EXP §8 Coins): name, allowed maximum, active. */
export function CoinReasonDialog({
  open,
  onOpenChange,
  reason,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: CoinReasonDto | null;
  onSaved: () => void;
}) {
  const t = useTranslations("coins.settings");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(coinReasonSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { name: "", maxCoins: 10, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: reason?.name ?? "",
      maxCoins: reason?.maxCoins ?? 10,
      isActive: reason?.isActive ?? true,
    });
  }, [open, reason, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      if (reason) await api(`/coin-reasons/${reason.id}`, { method: "PATCH", body: values });
      else await api("/coin-reasons", { method: "POST", body: values });
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
      title={reason ? t("editReason") : t("addReason")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="coin-reason-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="reason-name">{t("reasonName")}</Label>
        <Input id="reason-name" aria-invalid={!!errors.name} {...form.register("name")} />
        <FieldError id="reason-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason-max">{t("maxCoins")}</Label>
        <Input
          id="reason-max"
          type="number"
          min={1}
          aria-invalid={!!errors.maxCoins}
          {...form.register("maxCoins")}
        />
        <p className="text-xs text-muted-foreground">{t("maxCoinsHint")}</p>
        <FieldError id="reason-max-error" message={errors.maxCoins?.message} />
      </div>
      <Controller
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!field.value} onCheckedChange={(v) => field.onChange(!!v)} />
            {t("reasonActive")}
          </label>
        )}
      />
    </FormDialog>
  );
}
