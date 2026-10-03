"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { PaymentDto } from "@/server/services/students/payments.service";

/** EXP §6 "Pul qaytarish": pick one of the student's payments and give part of it back. */
export function RefundDialog({
  open,
  onOpenChange,
  payments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payments: PaymentDto[];
  onSaved: () => void;
}) {
  const tp = useTranslations("payments");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const refundable = payments.filter((p) => p.amount - p.refunded > 0);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPaymentId(refundable[0]?.id ?? "");
      setAmount("");
      setReason("");
      setError(null);
      setFields({});
    }
  }

  const chosen = refundable.find((p) => p.id === paymentId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/payments/${chosen.id}/refund`, {
        method: "POST",
        body: { amount, reason: reason || null },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tp("refundTitle")}
      description={tp("refundHint")}
      onSubmit={submit}
      submitting={busy || !chosen}
      error={error}
      testId="refund-dialog"
    >
      {refundable.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tp("nothingToRefund")}</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="refund-payment">{tp("pickPayment")}</Label>
            <Select value={paymentId} onValueChange={setPaymentId}>
              <SelectTrigger id="refund-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {refundable.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {fmt(parseDateOnly(p.paidAt), { dateStyle: "medium" })} · {p.groupName} ·{" "}
                    {money(p.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen && (
              <p className="text-xs text-muted-foreground">
                {tp("left", { amount: money(chosen.amount - chosen.refunded) })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-amount">{tp("refundAmount")}</Label>
            <Input
              id="refund-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!fields.amount}
            />
            <FieldError id="refund-amount-error" message={fields.amount?.[0]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reason">{tp("reason")}</Label>
            <Textarea
              id="refund-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
