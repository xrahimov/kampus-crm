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
import { MEMBERSHIP_STATUSES, type MembershipStatus } from "@/lib/validation/groups";
import type { BulkResult } from "@/server/services/students/bulk.service";
import type { StudentOptions } from "@/server/services/students/students.service";

const STATUSES = MEMBERSHIP_STATUSES.filter((s) => s === "NEW" || s === "TRIAL" || s === "ACTIVE");

export type BulkMode = "addToGroup" | "discount";

/**
 * Bulk "Add to group" and "Give a discount" on the students list (A-132): the
 * ticked students and one group; the server applies the action to each.
 */
export function BulkStudentsDialog({
  mode,
  studentIds,
  groups,
  onOpenChange,
  onDone,
}: {
  mode: BulkMode | null;
  studentIds: string[];
  groups: StudentOptions["groups"];
  onOpenChange: (open: boolean) => void;
  onDone: (result: BulkResult) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("students.bulk");
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState<MembershipStatus>("ACTIVE");
  const [joinedAt, setJoinedAt] = useState(todayIso());
  const [price, setPrice] = useState("");
  const [months, setMonths] = useState("1");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [lastMode, setLastMode] = useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode) {
      setGroupId("");
      setStatus("ACTIVE");
      setJoinedAt(todayIso());
      setPrice("");
      setMonths("1");
      setComment("");
      setError(null);
      setFields({});
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const body =
        mode === "addToGroup"
          ? { action: mode, studentIds, groupId, joinedAt, status }
          : {
              action: mode,
              studentIds,
              groupId,
              discountedPrice: price,
              months,
              comment: comment.trim() || null,
            };
      const result = await api<BulkResult>("/students/bulk", { method: "POST", body });
      onOpenChange(false);
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setFields(e.fields);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const count = studentIds.length;
  return (
    <FormDialog
      open={!!mode}
      onOpenChange={onOpenChange}
      title={mode === "discount" ? tb("discountTitle", { count }) : tb("addTitle", { count })}
      description={mode === "discount" ? tb("discountHint") : tb("addHint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="students-bulk-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="bulk-group">{t("students.filters.group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="bulk-group" aria-invalid={!!fields.groupId}>
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
        <FieldError id="bulk-group-error" message={fields.groupId?.[0]} />
      </div>
      {mode === "addToGroup" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bulk-date">{t("leads.addToGroup.joinedAt")}</Label>
            <Input
              id="bulk-date"
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              aria-invalid={!!fields.joinedAt}
            />
            <FieldError id="bulk-date-error" message={fields.joinedAt?.[0]} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-status">{t("leads.addToGroup.status")}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as MembershipStatus)}>
              <SelectTrigger id="bulk-status">
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
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-price">{t("discounts.form.price")}</Label>
              <Input
                id="bulk-price"
                type="number"
                min={0}
                step={1000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-invalid={!!fields.discountedPrice}
                required
              />
              <FieldError id="bulk-price-error" message={fields.discountedPrice?.[0]} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-months">{t("discounts.form.months")}</Label>
              <Input
                id="bulk-months"
                type="number"
                min={1}
                max={36}
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                aria-invalid={!!fields.months}
                required
              />
              <FieldError id="bulk-months-error" message={fields.months?.[0]} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-comment">{t("discounts.form.comment")}</Label>
            <Textarea
              id="bulk-comment"
              rows={2}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
