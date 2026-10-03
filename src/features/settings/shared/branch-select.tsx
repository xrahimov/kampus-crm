"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BranchOption {
  id: string;
  name: string;
}

/** Branch picker for create forms; hidden when only one branch is possible. */
export function BranchSelect({
  id,
  branches,
  value,
  onChange,
  error,
}: {
  id: string;
  branches: BranchOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const t = useTranslations();
  if (branches.length <= 1) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("branch.select")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={!!error}>
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
  );
}

/** Branches the actor may create records in, and the one preselected. */
export function creatableBranches(
  branches: BranchOption[],
  actorBranchIds: string[],
  activeBranchId: string | null,
  allBranches: boolean,
): { options: BranchOption[]; defaultId: string } {
  const options = allBranches ? branches : branches.filter((b) => actorBranchIds.includes(b.id));
  const defaultId =
    (activeBranchId && options.some((b) => b.id === activeBranchId) ? activeBranchId : null) ??
    options[0]?.id ??
    "";
  return { options, defaultId };
}
