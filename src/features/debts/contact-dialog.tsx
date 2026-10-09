"use client";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
import {
  DEBT_CHANNELS,
  DEBT_STAFF_OUTCOMES,
  type DebtChannel,
  type DebtStaffOutcome,
} from "@/lib/validation/debts";
import type { DebtCaseDto } from "@/server/services/debts/debts.service";

const NONE = "__none";

export interface ContactTarget {
  item: DebtCaseDto;
  channel: DebtChannel;
}

/** "Log a contact" on a debtor row (A-112): how, the outcome and, for a promise, the day and sum. */
export function ContactDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: ContactTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("debts");
  const tv = useTranslations("validation");
  const [channel, setChannel] = useState<DebtChannel>("CALL");
  const [outcome, setOutcome] = useState<string>(NONE);
  const [promisedAt, setPromisedAt] = useState("");
  const [promisedAmount, setPromisedAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) {
      setChannel(target.channel);
      setOutcome(NONE);
      setPromisedAt("");
      setPromisedAmount("");
      setNote("");
      setError(null);
      setFieldError(null);
    }
  }

  const promised = outcome === "PROMISED";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    if (promised && !promisedAt) {
      setFieldError("required");
      return;
    }
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      await api(`/debts/${target.item.id}/contacts`, {
        method: "POST",
        body: {
          channel,
          outcome: outcome === NONE ? null : outcome,
          promisedAt: promised ? promisedAt : null,
          promisedAmount: promised && promisedAmount ? Number(promisedAmount) : null,
          note: note.trim() || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const item = target?.item;
  return (
    <FormDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={t("dialog.title", { name: item?.studentName ?? "" })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="debt-contact-dialog"
    >
      {item && (item.phone || item.parentPhone) && (
        <div className="flex flex-wrap gap-4 text-sm" data-testid="debt-contact-phones">
          {item.phone && (
            <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 text-primary">
              <Phone className="size-4" /> {item.phone}
            </a>
          )}
          {item.parentPhone && (
            <a
              href={`tel:${item.parentPhone}`}
              className="inline-flex items-center gap-1 text-primary"
            >
              <Phone className="size-4" /> {item.parentPhone}
              <span className="text-muted-foreground"> · {t("dialog.parentPhone")}</span>
            </a>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="debt-channel">{t("dialog.channel")}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as DebtChannel)}>
            <SelectTrigger id="debt-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEBT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`channels.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="debt-outcome">{t("dialog.outcome")}</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger id="debt-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("dialog.none")}</SelectItem>
              {DEBT_STAFF_OUTCOMES.map((o: DebtStaffOutcome) => (
                <SelectItem key={o} value={o}>
                  {t(`outcomes.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {promised && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="debt-promised-at">{t("dialog.promisedAt")}</Label>
            <Input
              id="debt-promised-at"
              type="date"
              value={promisedAt}
              onChange={(e) => setPromisedAt(e.target.value)}
              aria-invalid={!!fieldError}
            />
            {fieldError && (
              <p className="text-xs text-destructive" role="alert">
                {tv(fieldError)}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt-promised-amount">{t("dialog.promisedAmount")}</Label>
            <Input
              id="debt-promised-amount"
              type="number"
              min={1}
              step={1000}
              value={promisedAmount}
              onChange={(e) => setPromisedAmount(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="debt-note">{t("dialog.note")}</Label>
        <Textarea
          id="debt-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
