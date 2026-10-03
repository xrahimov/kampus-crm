"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

/** "Lidlarga qaytarish" (EXP §5 row menu, A-08): the member leaves and reappears on the branch's board. */
export function ToLeadDialog({
  open,
  onOpenChange,
  membershipId,
  studentName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string | null;
  studentName: string;
  onSaved: () => void;
}) {
  const t = useTranslations("students.toLead");
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setReason("");
  }
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("text", { name: studentName })}
      confirmLabel={t("confirm")}
      onConfirm={async () => {
        if (!membershipId) return;
        await api(`/memberships/${membershipId}/to-lead`, {
          method: "POST",
          body: { reason: reason.trim() || null },
        });
        onSaved();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="to-lead-reason">{t("reason")}</Label>
        <Input
          id="to-lead-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          data-testid="to-lead-reason"
        />
      </div>
    </ConfirmDialog>
  );
}
