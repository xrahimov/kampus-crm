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
  localToday,
  shiftDate,
  statusAfterContact,
  suggestedFollowUpDays,
} from "@/lib/lead-follow-up";
import {
  LEAD_CONTACT_CHANNELS,
  LEAD_CONTACT_OUTCOMES,
  LEAD_STATUSES,
  type LeadContactChannel,
  type LeadContactOutcome,
  type LeadStatus,
} from "@/lib/validation/leads";
import type { LeadDto } from "@/server/services/leads/leads.service";

const NONE = "__none";

export interface LeadContactTarget {
  lead: LeadDto;
  channel: LeadContactChannel;
}

/**
 * "Log a contact" on a lead (A-126): how it went, the outcome, the next date and
 * the status. The outcome proposes a status and a next date; staff may change both.
 */
export function LeadContactDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: LeadContactTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("leads");
  const [channel, setChannel] = useState<LeadContactChannel>("CALL");
  const [outcome, setOutcome] = useState<string>(NONE);
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [statusTouched, setStatusTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) {
      setChannel(target.channel);
      setOutcome(NONE);
      setNote("");
      setDate("");
      setDateTouched(false);
      setStatus(target.lead.status);
      setStatusTouched(false);
      setError(null);
    }
  }

  function chooseOutcome(value: string) {
    setOutcome(value);
    if (!target) return;
    const chosen = value === NONE ? null : (value as LeadContactOutcome);
    if (!statusTouched) setStatus(statusAfterContact(chosen, target.lead.status));
    if (!dateTouched) {
      const days = suggestedFollowUpDays(chosen);
      setDate(days === null ? "" : shiftDate(localToday(), days));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/leads/${target.lead.id}/contacts`, {
        method: "POST",
        body: {
          channel,
          outcome: outcome === NONE ? null : outcome,
          note: note.trim() || null,
          nextContactAt: date || null,
          status,
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

  const lead = target?.lead;
  return (
    <FormDialog
      open={!!target}
      onOpenChange={onOpenChange}
      title={t("contact.title", { name: lead?.fullName ?? "" })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="lead-contact-dialog"
    >
      {lead && lead.phones.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm" data-testid="lead-contact-phones">
          {lead.phones.map((phone) => (
            <a
              key={phone}
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1 text-primary"
            >
              <Phone className="size-4" /> {phone}
            </a>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-contact-channel">{t("contact.channel")}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as LeadContactChannel)}>
            <SelectTrigger id="lead-contact-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_CONTACT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`channels.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-contact-outcome">{t("contact.outcome")}</Label>
          <Select value={outcome} onValueChange={chooseOutcome}>
            <SelectTrigger id="lead-contact-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("contact.none")}</SelectItem>
              {LEAD_CONTACT_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`outcomes.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-contact-date">{t("contact.nextContact")}</Label>
          <Input
            id="lead-contact-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDateTouched(true);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("contact.nextContactHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-contact-status">{t("contact.status")}</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as LeadStatus);
              setStatusTouched(true);
            }}
          >
            <SelectTrigger id="lead-contact-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`statuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-contact-note">{t("contact.note")}</Label>
        <Textarea
          id="lead-contact-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
