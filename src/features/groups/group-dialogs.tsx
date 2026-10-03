"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldError } from "@/components/data/field-error";
import { Checkbox } from "@/components/ui/checkbox";
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
import { GROUP_TEACHER_ROLES, SHARE_TYPES } from "@/lib/validation/groups";
import type { GroupDto } from "@/server/services/groups/groups.service";
import type { GroupFormOptions } from "@/server/services/groups/options.service";

type TeacherOption = GroupFormOptions["teachers"][number];
type GroupTeacherRole = (typeof GROUP_TEACHER_ROLES)[number];
type ShareType = (typeof SHARE_TYPES)[number];

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function run(call: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await call();
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      else setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, fields, run, reset: () => (setError(null), setFields({})) };
}

/** "Yordamchi o'qituvchilar" (EXP §5): pick support teachers for the group. */
export function SupportTeachersDialog({
  group,
  open,
  onOpenChange,
  teachers,
  onSaved,
}: {
  group: GroupDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teachers: TeacherOption[];
  onSaved: () => void;
}) {
  const t = useTranslations("groups.detail");
  const [picked, setPicked] = useState<string[] | null>(null);
  const current = picked ?? group.supportTeachers.map((s) => s.userId);
  const { busy, error, run, reset } = useSubmit(() => {
    onOpenChange(false);
    setPicked(null);
    onSaved();
  });
  const candidates = teachers.filter(
    (x) => x.branchIds.includes(group.branchId) && !group.teachers.some((gt) => gt.userId === x.id),
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setPicked(null);
        }
        onOpenChange(next);
      }}
      title={t("supportTeachers")}
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          api(`/groups/${group.id}/support-teachers`, {
            method: "POST",
            body: { userIds: current },
          }),
        );
      }}
      submitting={busy}
      error={error}
      testId="support-teachers-dialog"
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noSupportCandidates")}</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((x) => (
            <li key={x.id} className="flex items-center gap-2">
              <Checkbox
                id={`support-${x.id}`}
                checked={current.includes(x.id)}
                onCheckedChange={(v) =>
                  setPicked(v ? [...current, x.id] : current.filter((id) => id !== x.id))
                }
              />
              <Label htmlFor={`support-${x.id}`}>{x.fullName}</Label>
            </li>
          ))}
        </ul>
      )}
    </FormDialog>
  );
}

/** "O'qituvchini o'zgartirish": swap one teacher for another, with role and share. */
export function ChangeTeacherDialog({
  group,
  open,
  onOpenChange,
  teachers,
  onSaved,
}: {
  group: GroupDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teachers: TeacherOption[];
  onSaved: () => void;
}) {
  const t = useTranslations();
  const td = useTranslations("groups.detail");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [role, setRole] = useState<GroupTeacherRole>("MAIN");
  const [shareType, setShareType] = useState<ShareType>("PERCENT");
  const fromId = from || group.teachers[0]?.userId || "";
  const outgoing = group.teachers.find((x) => x.userId === fromId);
  const candidates = teachers.filter(
    (x) => x.branchIds.includes(group.branchId) && !group.teachers.some((gt) => gt.userId === x.id),
  );
  const toId = to || candidates[0]?.id || "";
  const { busy, error, fields, run, reset } = useSubmit(() => {
    onOpenChange(false);
    onSaved();
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    run(() =>
      api(`/groups/${group.id}/change-teacher`, {
        method: "POST",
        body: {
          fromUserId: fromId,
          to: {
            userId: toId,
            role: outgoing ? outgoing.role : role,
            shareType,
            shareValue: Number(data.get("shareValue")),
          },
        },
      }),
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={td("changeTeacher")}
      description={td("changeTeacherHint")}
      onSubmit={submit}
      submitting={busy || !fromId || !toId}
      error={error}
      testId="change-teacher-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="ct-from">{td("outgoingTeacher")}</Label>
        <Select value={fromId} onValueChange={setFrom}>
          <SelectTrigger id="ct-from">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {group.teachers.map((x) => (
              <SelectItem key={x.userId} value={x.userId}>
                {x.fullName} · {t(`groups.teacherRoles.${x.role}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-to">{td("incomingTeacher")}</Label>
        <Select value={toId} onValueChange={setTo}>
          <SelectTrigger id="ct-to" data-testid="ct-to">
            <SelectValue placeholder={td("noCandidates")} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="ct-to-error" message={fields["to.userId"]?.[0]} />
      </div>
      {!outgoing && (
        <div className="space-y-2">
          <Label htmlFor="ct-role">{t("groups.form.teacherRole")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as GroupTeacherRole)}>
            <SelectTrigger id="ct-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_TEACHER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`groups.teacherRoles.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ct-shareType">{t("groups.form.shareType")}</Label>
          <Select value={shareType} onValueChange={(v) => setShareType(v as ShareType)}>
            <SelectTrigger id="ct-shareType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHARE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`groups.shareTypes.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ct-shareValue">{t("groups.form.shareValue")}</Label>
          <Input
            id="ct-shareValue"
            name="shareValue"
            type="number"
            min={0}
            step="any"
            defaultValue={outgoing?.shareValue ?? 0}
            required
          />
          <FieldError id="ct-shareValue-error" message={fields["to.shareValue"]?.[0]} />
        </div>
      </div>
    </FormDialog>
  );
}

/** "Dam berish": a day the group skips; the unmarked lesson that day is removed (A-53). */
export function DayOffDialog({
  group,
  open,
  onOpenChange,
  onSaved,
}: {
  group: GroupDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("groups.detail");
  const { busy, error, fields, run, reset } = useSubmit(() => {
    onOpenChange(false);
    onSaved();
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={t("dayOff")}
      description={t("dayOffHint")}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        run(() =>
          api(`/groups/${group.id}/day-off`, {
            method: "POST",
            body: { date: data.get("date"), reason: data.get("reason") },
          }),
        );
      }}
      submitting={busy}
      error={error}
      testId="day-off-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="dayoff-date">{t("date")}</Label>
        <Input id="dayoff-date" name="date" type="date" defaultValue={todayIso()} required />
        <FieldError id="dayoff-date-error" message={fields.date?.[0]} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dayoff-reason">{t("reason")}</Label>
        <Input id="dayoff-reason" name="reason" required maxLength={200} />
        <FieldError id="dayoff-reason-error" message={fields.reason?.[0]} />
      </div>
    </FormDialog>
  );
}
