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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import { MEMBERSHIP_STATUSES } from "@/lib/validation/groups";
import type { WaitlistEntryDto } from "@/server/services/leads/waitlist.service";

type GroupOption = { id: string; name: string; status: string };

/** "Enrol": the person joins a group of their course; the entry closes (A-138). */
export function WaitlistEnrolDialog({
  entry,
  onOpenChange,
  onSaved,
}: {
  entry: WaitlistEntryDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("leads.waitlist");
  const tg = useTranslations("groups");
  const [groups, setGroups] = useState<{ courseId: string; items: GroupOption[] } | null>(null);
  const [groupId, setGroupId] = useState("");
  const [joinedAt, setJoinedAt] = useState(todayIso());
  const [status, setStatus] = useState<string>("NEW");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const [lastEntry, setLastEntry] = useState(entry);
  if (entry !== lastEntry) {
    setLastEntry(entry);
    if (entry) {
      setGroupId(entry.offeredGroup?.id ?? "");
      setJoinedAt(todayIso());
      setStatus("NEW");
      setError(null);
      setFields({});
    }
  }

  const courseId = entry?.courseId ?? null;
  const branchId = entry?.branchId ?? null;
  useEffect(() => {
    if (!courseId || !branchId) return;
    let live = true;
    api<{ items: Array<GroupOption & { branchId: string }> }>(
      `/groups?courseId=${courseId}&status=ALL&pageSize=100`,
    )
      .then((page) => {
        if (!live) return;
        setGroups({
          courseId,
          items: page.items.filter((g) => g.branchId === branchId && g.status !== "ARCHIVED"),
        });
      })
      .catch(() => {
        if (live) setGroups({ courseId, items: [] });
      });
    return () => {
      live = false;
    };
  }, [courseId, branchId]);
  const options = groups && groups.courseId === courseId ? groups.items : [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/waitlist/${entry.id}/enrol`, {
        method: "POST",
        body: { groupId, joinedAt, status },
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setFields(e.fields);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={!!entry}
      onOpenChange={onOpenChange}
      title={t("enrolTitle", { name: entry?.fullName ?? "" })}
      description={t("enrolHint", { course: entry?.courseName ?? "" })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      submitLabel={t("enrol")}
      testId="waitlist-enrol-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="wl-group">{t("fields.group")}</Label>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger id="wl-group" aria-invalid={!!fields.groupId} data-testid="wl-group">
            <SelectValue placeholder={t("fields.groupPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="wl-group-error" message={fields.groupId?.[0]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="wl-joined">{t("fields.joinedAt")}</Label>
          <Input
            id="wl-joined"
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
            aria-invalid={!!fields.joinedAt}
          />
          <FieldError id="wl-joined-error" message={fields.joinedAt?.[0]} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-status">{t("fields.status")}</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="wl-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERSHIP_STATUSES.filter(
                (s) => s === "NEW" || s === "TRIAL" || s === "ACTIVE",
              ).map((s) => (
                <SelectItem key={s} value={s}>
                  {tg(`memberStatuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FormDialog>
  );
}
