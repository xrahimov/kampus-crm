"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";

const ALL = "__all__";

export function BranchSelector({
  branches,
  activeBranch,
  canChooseAll,
}: {
  branches: Array<{ id: string; name: string }>;
  activeBranch: { id: string; name: string } | null;
  canChooseAll: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (branches.length <= 1 && !canChooseAll) {
    return (
      <span className="hidden items-center gap-1 text-sm text-muted-foreground sm:inline-flex">
        <Building2 className="size-4" />
        {activeBranch?.name ?? branches[0]?.name}
      </span>
    );
  }

  async function onChange(value: string) {
    await api("/auth/active-branch", {
      method: "POST",
      body: { branchId: value === ALL ? null : value },
    });
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending} aria-label={t("branch.select")}>
          <Building2 />
          <span className="max-w-32 truncate">{activeBranch?.name ?? t("common.allBranches")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("branch.active")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={activeBranch?.id ?? ALL} onValueChange={onChange}>
          {canChooseAll && (
            <DropdownMenuRadioItem value={ALL}>{t("common.allBranches")}</DropdownMenuRadioItem>
          )}
          {branches.map((b) => (
            <DropdownMenuRadioItem key={b.id} value={b.id}>
              {b.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
