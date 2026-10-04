"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { giveCoinsSchema } from "@/lib/validation/coins";
import type { CoinReasonDto } from "@/server/services/coins/coins.service";

type Input = z.input<typeof giveCoinsSchema>;
type Output = z.output<typeof giveCoinsSchema>;

/** "COIN BERISH" (EXP §5 COINLAR): reason (with its cap), amount, comment. */
export function GiveCoinsDialog({
  open,
  onOpenChange,
  student,
  groupId,
  reasons,
  canExceed,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: { id: string; fullName: string } | null;
  groupId: string | null;
  reasons: CoinReasonDto[];
  /** Managers may give more than a reason's cap (teachers may not). */
  canExceed: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("coins.give");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(giveCoinsSchema) as unknown as Resolver<Input, unknown, Output>,
    defaultValues: { studentId: "", groupId: null, reasonId: "", amount: 1, comment: "" },
  });
  const reasonId = useWatch({ control: form.control, name: "reasonId" });
  const reason = reasons.find((r) => r.id === reasonId) ?? null;

  useEffect(() => {
    if (!open || !student) return;
    const first = reasons[0];
    form.reset({
      studentId: student.id,
      groupId,
      reasonId: first?.id ?? "",
      amount: first ? Math.min(first.maxCoins, 5) : 1,
      comment: "",
    });
  }, [open, student, groupId, reasons, form]);

  async function onSubmit(values: Output) {
    setError(null);
    try {
      await api("/coins/give", { method: "POST", body: values });
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
      title={t("title")}
      description={student?.fullName}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="give-coins-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="give-reason">{t("reason")}</Label>
        <Controller
          control={form.control}
          name="reasonId"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id="give-reason" aria-invalid={!!errors.reasonId}>
                <SelectValue placeholder={t("pickReason")} />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} · {t("upTo", { max: r.maxCoins })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {reasons.length === 0 && <p className="text-xs text-muted-foreground">{t("noReasons")}</p>}
        <FieldError id="give-reason-error" message={errors.reasonId?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="give-amount">{t("amount")}</Label>
        <Input
          id="give-amount"
          type="number"
          min={1}
          max={reason && !canExceed ? reason.maxCoins : undefined}
          aria-invalid={!!errors.amount}
          {...form.register("amount")}
        />
        {reason && (
          <p className="text-xs text-muted-foreground">{t("maxHint", { max: reason.maxCoins })}</p>
        )}
        <FieldError id="give-amount-error" message={errors.amount?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="give-comment">{t("comment")}</Label>
        <Textarea id="give-comment" rows={2} {...form.register("comment")} />
        <FieldError id="give-comment-error" message={errors.comment?.message} />
      </div>
    </FormDialog>
  );
}
