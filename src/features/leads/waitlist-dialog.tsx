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
import { LEAD_DAYS } from "@/lib/validation/leads";
import type { WaitlistEntryDto } from "@/server/services/leads/waitlist.service";

const NONE = "__none";

export interface WaitlistDraft {
  /** An existing entry to edit, or null for a new one. */
  entry: WaitlistEntryDto | null;
  /** Prefilled from a lead card ("Add to waiting list"). */
  leadId?: string | null;
  branchId: string;
  fullName?: string;
  phone?: string;
  days?: string | null;
  lessonTime?: string | null;
}

/**
 * One entry on the waiting list (A-138): who, for which course, when they can
 * come. Opened empty from the list page, prefilled from a lead card, or with
 * an existing entry to edit.
 */
export function WaitlistDialog({
  draft,
  courses,
  branches,
  onOpenChange,
  onSaved,
}: {
  draft: WaitlistDraft | null;
  courses: Array<{ id: string; name: string; branchId: string }>;
  branches: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: (entry: WaitlistEntryDto) => void;
}) {
  const t = useTranslations("leads.waitlist");
  const tl = useTranslations("leads");
  const [form, setForm] = useState({
    branchId: "",
    courseId: "",
    fullName: "",
    phone: "",
    days: NONE,
    lessonTime: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [lastDraft, setLastDraft] = useState(draft);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    if (draft) {
      const e = draft.entry;
      setForm({
        branchId: e?.branchId ?? draft.branchId,
        courseId: e?.courseId ?? "",
        fullName: e?.fullName ?? draft.fullName ?? "",
        phone: e?.phone ?? draft.phone ?? "",
        days: e?.days ?? draft.days ?? NONE,
        lessonTime: e?.lessonTime ?? draft.lessonTime ?? "",
        note: e?.note ?? "",
      });
      setError(null);
      setFields({});
    }
  }

  const branchCourses = courses.filter((c) => c.branchId === form.branchId);
  const editing = !!draft?.entry;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    setFields({});
    const common = {
      courseId: form.courseId,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      days: form.days === NONE ? null : form.days,
      lessonTime: form.lessonTime || null,
      note: form.note.trim() || null,
    };
    try {
      const entry = draft.entry
        ? await api<WaitlistEntryDto>(`/waitlist/${draft.entry.id}`, {
            method: "PATCH",
            body: common,
          })
        : await api<WaitlistEntryDto>("/waitlist", {
            method: "POST",
            body: { ...common, branchId: form.branchId, leadId: draft.leadId ?? null },
          });
      onOpenChange(false);
      onSaved(entry);
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setFields(e.fields);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <FormDialog
      open={!!draft}
      onOpenChange={onOpenChange}
      title={editing ? t("edit") : t("add")}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="waitlist-dialog"
    >
      {!editing && branches.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="wl-branch">{t("fields.branch")}</Label>
          <Select
            value={form.branchId}
            onValueChange={(v) => setForm((f) => ({ ...f, branchId: v, courseId: "" }))}
          >
            <SelectTrigger id="wl-branch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="wl-course">{t("fields.course")}</Label>
        <Select value={form.courseId} onValueChange={set("courseId")}>
          <SelectTrigger id="wl-course" aria-invalid={!!fields.courseId} data-testid="wl-course">
            <SelectValue placeholder={t("fields.coursePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {branchCourses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="wl-course-error" message={fields.courseId?.[0]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wl-name">{t("fields.name")}</Label>
          <Input
            id="wl-name"
            value={form.fullName}
            onChange={(e) => set("fullName")(e.target.value)}
            aria-invalid={!!fields.fullName}
            data-testid="wl-name"
          />
          <FieldError id="wl-name-error" message={fields.fullName?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-phone">{t("fields.phone")}</Label>
          <Input
            id="wl-phone"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            placeholder="+998"
            aria-invalid={!!fields.phone}
            data-testid="wl-phone"
          />
          <FieldError id="wl-phone-error" message={fields.phone?.[0]} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wl-days">{t("fields.days")}</Label>
          <Select value={form.days} onValueChange={set("days")}>
            <SelectTrigger id="wl-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("fields.anyDays")}</SelectItem>
              {LEAD_DAYS.map((d) => (
                <SelectItem key={d} value={d}>
                  {tl(`days.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-time">{t("fields.time")}</Label>
          <Input
            id="wl-time"
            type="time"
            value={form.lessonTime}
            onChange={(e) => set("lessonTime")(e.target.value)}
            aria-invalid={!!fields.lessonTime}
          />
          <FieldError id="wl-time-error" message={fields.lessonTime?.[0]} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="wl-note">{t("fields.note")}</Label>
        <Textarea
          id="wl-note"
          rows={2}
          maxLength={500}
          value={form.note}
          onChange={(e) => set("note")(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}
