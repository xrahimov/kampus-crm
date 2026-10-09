"use client";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
  ABSENCE_CHANNELS,
  ABSENCE_OUTCOMES,
  type AbsenceChannel,
  type AbsenceOutcome,
} from "@/lib/validation/absences";
import type { AbsenceCaseDto } from "@/server/services/absences/absences.service";

const NONE = "__none";

export interface ContactTarget {
  item: AbsenceCaseDto;
  channel: AbsenceChannel;
}

/** "Log a contact" on an absence row (A-125): how the family was reached, the outcome and a note. */
export function ContactDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: ContactTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("absences");
  const [channel, setChannel] = useState<AbsenceChannel>("CALL");
  const [outcome, setOutcome] = useState<string>(NONE);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastTarget, setLastTarget] = useState(target);
  if (target !== lastTarget) {
    setLastTarget(target);
    if (target) {
      setChannel(target.channel);
      setOutcome(NONE);
      setNote("");
      setError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/absences/${target.item.id}/contacts`, {
        method: "POST",
        body: {
          channel,
          outcome: outcome === NONE ? null : outcome,
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
      testId="absence-contact-dialog"
    >
      {item && (item.phone || item.parentPhone) && (
        <div className="flex flex-wrap gap-4 text-sm" data-testid="absence-contact-phones">
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
          <Label htmlFor="absence-channel">{t("dialog.channel")}</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as AbsenceChannel)}>
            <SelectTrigger id="absence-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ABSENCE_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`channels.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="absence-outcome">{t("dialog.outcome")}</Label>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger id="absence-outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("dialog.none")}</SelectItem>
              {ABSENCE_OUTCOMES.map((o: AbsenceOutcome) => (
                <SelectItem key={o} value={o}>
                  {t(`outcomes.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="absence-note">{t("dialog.note")}</Label>
        <Textarea
          id="absence-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
