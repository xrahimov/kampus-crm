"use client";

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
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { GroupDto } from "@/server/services/groups/groups.service";

/** "Boshqa filialga o'tkazish" (EXP §5 row menu). */
export function MoveBranchDialog({
  group,
  branches,
  onOpenChange,
  onSaved,
}: {
  group: GroupDto | null;
  branches: BranchOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [branchId, setBranchId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = branches.filter((b) => b.id !== group?.branchId);
  const chosen = branchId || targets[0]?.id || "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${group.id}/move-branch`, { method: "POST", body: { branchId: chosen } });
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
      open={!!group}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          setBranchId("");
        }
        onOpenChange(open);
      }}
      title={t("groups.actions.moveBranch")}
      description={t("groups.moveBranchText", { name: group?.name ?? "" })}
      onSubmit={submit}
      submitting={busy}
      error={error}
      testId="move-branch-dialog"
    >
      <div className="space-y-2">
        <Label htmlFor="move-branch">{t("branch.select")}</Label>
        <Select value={chosen} onValueChange={setBranchId}>
          <SelectTrigger id="move-branch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targets.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </FormDialog>
  );
}
