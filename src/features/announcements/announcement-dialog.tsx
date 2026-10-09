"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import { ANNOUNCEMENT_AUDIENCES, type AnnouncementAudience } from "@/lib/validation/announcements";

export interface GroupOption {
  id: string;
  name: string;
  branchId: string;
}

/** "New announcement" (A-129): where it goes, the title and text, and whether to send SMS too. */
export function AnnouncementDialog({
  open,
  onOpenChange,
  branches,
  groups,
  canCentre,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  groups: GroupOption[];
  canCentre: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("announcements");
  const [audience, setAudience] = useState<AnnouncementAudience>("GROUP");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAudience("GROUP");
      setBranchId(branches[0]?.id ?? "");
      setGroupId("");
      setTitle("");
      setBody("");
      setSendSms(false);
      setError(null);
    }
  }

  const audiences = ANNOUNCEMENT_AUDIENCES.filter((a) => a !== "CENTRE" || canCentre);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/announcements", {
        method: "POST",
        body: {
          audience,
          branchId: audience === "BRANCH" ? branchId : null,
          groupId: audience === "GROUP" ? groupId : null,
          title,
          body,
          sendSms,
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("dialog.title")}
      description={t("dialog.recipientsHint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      submitLabel={t("dialog.submit")}
      testId="announcement-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="announcement-audience">{t("dialog.audience")}</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
            <SelectTrigger id="announcement-audience" data-testid="announcement-audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {audiences.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`audience.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {audience === "BRANCH" && (
          <div className="space-y-2">
            <Label htmlFor="announcement-branch">{t("dialog.branch")}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id="announcement-branch" data-testid="announcement-branch">
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
        {audience === "GROUP" && (
          <div className="space-y-2">
            <Label htmlFor="announcement-group">{t("dialog.group")}</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="announcement-group" data-testid="announcement-group">
                <SelectValue placeholder={t("dialog.pickGroup")} />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="announcement-title">{t("dialog.titleField")}</Label>
        <Input
          id="announcement-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          data-testid="announcement-title-input"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="announcement-body">{t("dialog.body")}</Label>
        <Textarea
          id="announcement-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
          data-testid="announcement-body"
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id="announcement-sms"
          checked={sendSms}
          onCheckedChange={(v) => setSendSms(v === true)}
          data-testid="announcement-sms"
        />
        <div className="space-y-0.5">
          <Label htmlFor="announcement-sms" className="font-normal">
            {t("dialog.sendSms")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("dialog.sendSmsHint")}</p>
        </div>
      </div>
    </FormDialog>
  );
}
