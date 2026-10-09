"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedGroup, SegmentedItem } from "@/components/ui/radio-group";
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
import { todayIso } from "@/features/staff/password";
import { BALANCE_ADJUSTMENT_KINDS, type BalanceAdjustmentKind } from "@/lib/validation/students";

export interface AdjustableMembership {
  membershipId: string;
  groupName: string;
  status: string;
}

/**
 * "Qoldiqni to'g'rilash" (A-109): the debt or credit a student brought from the old
 * system, or a correction. The cashier types a positive amount and says which way it
 * goes; the server stores it signed.
 */
export function AdjustmentDialog({
  open,
  onOpenChange,
  memberships,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberships: AdjustableMembership[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const ta = useTranslations("payments.adjust");
  const [membershipId, setMembershipId] = useState("");
  const [direction, setDirection] = useState<"debt" | "credit">("debt");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<BalanceAdjustmentKind>("OPENING");
  const [date, setDate] = useState(todayIso());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId(memberships[0]?.membershipId ?? "");
      setDirection("debt");
      setAmount("");
      setKind("OPENING");
      setDate(todayIso());
      setComment("");
      setError(null);
      setFields({});
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const value = Number(amount);
    try {
      await api("/adjustments", {
        method: "POST",
        body: {
          membershipId,
          amount: direction === "debt" ? -Math.abs(value) : Math.abs(value),
          kind,
          date,
          comment: comment.trim() || null,
        },
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
      title={ta("title")}
      description={ta("hint")}
      onSubmit={submit}
      submitting={busy || !membershipId || !amount}
      error={error}
      testId="adjustment-dialog"
    >
      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("payments.noMemberships")}</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="adjust-group">{ta("group")}</Label>
            <Select value={membershipId} onValueChange={setMembershipId}>
              <SelectTrigger id="adjust-group" data-testid="adjust-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.membershipId} value={m.membershipId}>
                    {m.groupName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id="adjust-group-error" message={fields.membershipId?.[0]} />
          </div>
          <div className="space-y-2">
            <Label>{ta("direction")}</Label>
            <SegmentedGroup
              value={direction}
              onValueChange={(v) => setDirection(v as "debt" | "credit")}
              data-testid="adjust-direction"
            >
              <SegmentedItem value="debt" data-testid="adjust-debt">
                {ta("debt")}
              </SegmentedItem>
              <SegmentedItem value="credit" data-testid="adjust-credit">
                {ta("credit")}
              </SegmentedItem>
            </SegmentedGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-amount">{ta("amount")}</Label>
            <Input
              id="adjust-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!fields.amount}
              data-testid="adjust-amount"
            />
            <FieldError id="adjust-amount-error" message={fields.amount?.[0]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-kind">{ta("kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BalanceAdjustmentKind)}>
                <SelectTrigger id="adjust-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BALANCE_ADJUSTMENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`payments.adjustments.kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-date">{ta("date")}</Label>
              <Input
                id="adjust-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!fields.date}
              />
              <FieldError id="adjust-date-error" message={fields.date?.[0]} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-comment">{ta("comment")}</Label>
            <Textarea
              id="adjust-comment"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
