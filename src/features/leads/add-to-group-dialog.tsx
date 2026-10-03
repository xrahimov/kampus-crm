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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import { MEMBERSHIP_STATUSES, type MembershipStatus } from "@/lib/validation/groups";
import type { LeadOptions, LeadsToGroupResult } from "@/server/services/leads/leads.service";

const STATUSES = MEMBERSHIP_STATUSES.filter((s) => s === "NEW" || s === "TRIAL" || s === "ACTIVE");

/** "LIDLARNI GURUHGA QO'SHISH": the checked leads join one group as students (A-68). */
export function AddToGroupDialog({
  open,
  onOpenChange,
  leadIds,
  branchId,
  groups,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  branchId: string;
  groups: LeadOptions["groups"];
  onDone: (result: LeadsToGroupResult) => void;
}) {
  const t = useTranslations();
  const ta = useTranslations("leads.addToGroup");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState<MembershipStatus>("NEW");
  const [joinedAt, setJoinedAt] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId("");
      setStatus("NEW");
      setJoinedAt(todayIso());
      setError(null);
      setFields({});
    }
  }

  const candidates = groups.filter((g) => g.branchId === branchId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const result = await api<LeadsToGroupResult>("/leads/add-to-group", {
        method: "POST",
        body: { leadIds, groupId, joinedAt, status },
      });
      onOpenChange(false);
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && !e.fields ? e.message : null);
      if (e instanceof ApiError && e.fields && !Object.keys(e.fields).length) setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={ta("title")}
      description={ta("hint", { count: leadIds.length })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="leads-to-group-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="ltg-group">{ta("group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="ltg-group" aria-invalid={!!fields.groupId}>
            <SelectValue placeholder={ta("groupPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="ltg-group-error" message={fields.groupId?.[0]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ltg-date">{ta("joinedAt")}</Label>
          <Input
            id="ltg-date"
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
            aria-invalid={!!fields.joinedAt}
          />
          <FieldError id="ltg-date-error" message={fields.joinedAt?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ltg-status">{ta("status")}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as MembershipStatus)}>
            <SelectTrigger id="ltg-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`groups.memberStatuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormDialog>
  );
}
