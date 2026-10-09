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
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import type { LeadDto, LeadOptions } from "@/server/services/leads/leads.service";
import type { TrialBookingDto } from "@/server/services/leads/trials.service";

/**
 * "Book a trial" on a lead (A-131): the group of the lead's branch, the day and
 * a note for the teacher. The visitor then appears on the Today roster.
 */
export function TrialDialog({
  lead,
  groups,
  onOpenChange,
  onSaved,
}: {
  lead: LeadDto | null;
  groups: LeadOptions["groups"];
  onOpenChange: (open: boolean) => void;
  onSaved: (booking: TrialBookingDto) => void;
}) {
  const t = useTranslations("leads.trial");
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [lastLead, setLastLead] = useState(lead);
  if (lead !== lastLead) {
    setLastLead(lead);
    if (lead) {
      setGroupId("");
      setDate(todayIso());
      setNote("");
      setError(null);
      setFields({});
    }
  }

  const candidates = lead ? groups.filter((g) => g.branchId === lead.branchId) : [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const booking = await api<TrialBookingDto>(`/leads/${lead.id}/trials`, {
        method: "POST",
        body: { groupId, date, note: note.trim() || null },
      });
      onOpenChange(false);
      onSaved(booking);
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setFields(e.fields);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={!!lead}
      onOpenChange={onOpenChange}
      title={t("title", { name: lead?.fullName ?? "" })}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="trial-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="trial-group">{t("group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="trial-group" aria-invalid={!!fields.groupId}>
            <SelectValue placeholder={t("groupPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="trial-group-error" message={fields.groupId?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trial-date">{t("date")}</Label>
        <Input
          id="trial-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={!!fields.date}
          data-testid="trial-date"
        />
        <FieldError id="trial-date-error" message={fields.date?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="trial-note">{t("note")}</Label>
        <Textarea
          id="trial-note"
          rows={2}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
