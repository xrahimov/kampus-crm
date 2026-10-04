"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import type { StudentOptions } from "@/server/services/students/students.service";

import { LeaveReasonField } from "./leave-reason-field";

/** "Boshqa guruhga ko'chirish" (EXP §5 row menu, A-63). */
export function TransferDialog({
  open,
  onOpenChange,
  membershipId,
  currentGroupId,
  studentName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string | null;
  currentGroupId: string;
  studentName: string;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tt = useTranslations("students.transfer");
  const [groups, setGroups] = useState<StudentOptions["groups"]>([]);
  const [groupId, setGroupId] = useState("");
  const [customPrice, setCustomPrice] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId("");
      setCustomPrice(false);
      setReason("");
      setError(null);
      setFields({});
    }
  }

  useEffect(() => {
    if (!open) return;
    api<StudentOptions>("/students/options")
      .then((o) =>
        setGroups(o.groups.filter((g) => g.id !== currentGroupId && g.status !== "ARCHIVED")),
      )
      .catch(() => setGroups([]));
  }, [open, currentGroupId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipId) return;
    if (!groupId) {
      setFields({ groupId: ["validation.required"] });
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/memberships/${membershipId}/transfer`, {
        method: "POST",
        body: {
          groupId,
          joinedAt: data.get("joinedAt"),
          customPrice: customPrice ? data.get("customPrice") : null,
          note: String(data.get("note") ?? "").trim() || null,
          reason: reason.trim() || null,
        },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${tt("title")}: ${studentName}`}
      description={tt("hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="transfer-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="transfer-group">{tt("group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="transfer-group" aria-invalid={!!fields.groupId}>
            <SelectValue placeholder={t("students.form.groupPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
                {g.teacherName ? ` (${g.teacherName})` : ""}
                {g.time ? ` · ${g.time}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="transfer-group-error" message={fields.groupId?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="transfer-date">{tt("date")}</Label>
        <Input id="transfer-date" name="joinedAt" type="date" defaultValue={todayIso()} required />
        <FieldError id="transfer-date-error" message={fields.joinedAt?.[0]} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="transfer-custom" checked={customPrice} onCheckedChange={setCustomPrice} />
          <Label htmlFor="transfer-custom">{t("groups.members.customPriceToggle")}</Label>
        </div>
        {customPrice && (
          <Input
            name="customPrice"
            type="number"
            min={0}
            step="1000"
            aria-label={t("groups.members.customPrice")}
            placeholder={t("groups.members.customPrice")}
          />
        )}
      </div>
      <LeaveReasonField
        kind="TRANSFER"
        value={reason}
        onChange={setReason}
        active={open}
        id="transfer-reason"
      />
      <div className="space-y-2">
        <Label htmlFor="transfer-note">{t("groups.members.note")}</Label>
        <Textarea id="transfer-note" name="note" rows={2} />
      </div>
    </FormDialog>
  );
}
