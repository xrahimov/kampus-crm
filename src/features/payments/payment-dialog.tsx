"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { MembershipStatus } from "@/lib/validation/groups";
import type {
  PaymentDto,
  PaymentInfoDto,
  PaymentOptionsDto,
} from "@/server/services/students/payments.service";

export interface PayableMembership {
  membershipId: string;
  groupName: string;
  status: MembershipStatus;
  teacherName?: string | null;
  time?: string | null;
}

/** Opens the printable receipt in a new tab (EXP §8 "print receipt after payment"). */
export function openReceipt(paymentId: string) {
  window.open(`/payments/${paymentId}/receipt`, "_blank", "noopener");
}

/** EXP §5 "To'lov" dialog, also used from the student page and the header button. */
export function PaymentDialog({
  open,
  onOpenChange,
  studentName,
  memberships,
  defaultMembershipId,
  options,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  memberships: PayableMembership[];
  defaultMembershipId?: string | null;
  options: PaymentOptionsDto;
  onSaved: (payment: PaymentDto) => void;
}) {
  const t = useTranslations();
  const tp = useTranslations("payments");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const [membershipId, setMembershipId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("");
  const [comment, setComment] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [month, setMonth] = useState("");
  const [info, setInfo] = useState<PaymentInfoDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId(defaultMembershipId ?? memberships[0]?.membershipId ?? "");
      setMethodId("");
      setAmount("");
      setBonus("");
      setComment("");
      setPaidAt(todayIso());
      setMonth("");
      setInfo(null);
      setError(null);
      setFields({});
    }
  }

  useEffect(() => {
    if (!open || !membershipId) return;
    const controller = new AbortController();
    api<PaymentInfoDto>(`/memberships/${membershipId}/payment-info`, { signal: controller.signal })
      .then(setInfo)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => controller.abort();
  }, [open, membershipId]);

  const monthLabel = (m: string) => fmt(parseDateOnly(m), { month: "short", year: "numeric" });
  /** The chosen month, or the suggested one until the user picks another. */
  const effectiveMonth = month || info?.suggestedMonth || "";
  const monthOptions = info?.months ?? (effectiveMonth ? [effectiveMonth] : []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFields({});
    if (!methodId) {
      setFields({ paymentMethodId: ["validation.required"] });
      return;
    }
    setBusy(true);
    try {
      const payment = await api<PaymentDto>("/payments", {
        method: "POST",
        body: {
          membershipId,
          paymentMethodId: methodId,
          amount,
          bonus,
          effectiveMonth,
          paidAt,
          comment: comment || null,
        },
      });
      if (options.printReceiptAfterPayment) openReceipt(payment.id);
      onOpenChange(false);
      onSaved(payment);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => fields[k]?.[0];
  const quick = options.methods.slice(0, 2);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tp("dialogTitle", { name: studentName })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="payment-dialog"
    >
      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tp("noMemberships")}</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="pay-method">{tp("method")}</Label>
            <div className="flex flex-wrap gap-2">
              {quick.map((m) => (
                <Button
                  key={m.id}
                  type="button"
                  size="sm"
                  variant={methodId === m.id ? "default" : "outline"}
                  onClick={() => setMethodId(m.id)}
                >
                  {m.name}
                </Button>
              ))}
              <Select value={methodId} onValueChange={setMethodId}>
                <SelectTrigger
                  id="pay-method"
                  className="min-w-40 flex-1"
                  aria-invalid={!!err("paymentMethodId")}
                >
                  <SelectValue placeholder={tp("methodPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {options.methods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldError id="pay-method-error" message={err("paymentMethodId")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-group">{tp("group")}</Label>
            <Select
              value={membershipId}
              onValueChange={(v) => {
                setMembershipId(v);
                setMonth("");
              }}
            >
              <SelectTrigger id="pay-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.membershipId} value={m.membershipId}>
                    {m.groupName}
                    {m.teacherName ? ` (${m.teacherName})` : ""}
                    {m.time ? ` · ${m.time}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {info && (
              <p
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                data-testid="payment-info"
              >
                <span>
                  {tp("balance")}:{" "}
                  <span
                    className={
                      info.balance < 0
                        ? "font-medium text-destructive"
                        : "font-medium text-foreground"
                    }
                  >
                    {money(info.balance)}
                  </span>
                </span>
                <Badge variant="outline">{t(`groups.statuses.${info.groupStatus}`)}</Badge>
                <span>
                  {tp("monthlyPrice")}: {money(info.monthlyPrice)}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-amount">{tp("amount")}</Label>
            <div className="flex gap-2">
              <Input
                id="pay-amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!!err("amount")}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={!info}
                onClick={() => info && setAmount(String(info.suggestedAmount))}
                data-testid="pay-autofill"
              >
                {tp("autoFill")}
              </Button>
            </div>
            <FieldError id="pay-amount-error" message={err("amount")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pay-month">{tp("effectiveMonth")}</Label>
              <Select value={effectiveMonth} onValueChange={setMonth}>
                <SelectTrigger id="pay-month" aria-invalid={!!err("effectiveMonth")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="pay-month-error" message={err("effectiveMonth")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">{tp("date")}</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
              <FieldError id="pay-date-error" message={err("paidAt")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-comment">{tp("comment")}</Label>
            <Textarea
              id="pay-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pay-bonus">{tp("bonus")}</Label>
            <Input
              id="pay-bonus"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
            <FieldError id="pay-bonus-error" message={err("bonus")} />
          </div>
        </>
      )}
    </FormDialog>
  );
}
