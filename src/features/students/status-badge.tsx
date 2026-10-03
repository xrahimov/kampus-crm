"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { MembershipStatus } from "@/lib/validation/groups";

const VARIANT: Record<MembershipStatus, "success" | "secondary" | "muted" | "outline" | "default"> =
  {
    NEW: "outline",
    TRIAL: "secondary",
    ACTIVE: "success",
    FROZEN: "default",
    ARCHIVED: "muted",
    GRADUATED: "muted",
  };

export function MemberStatusBadge({ status }: { status: MembershipStatus }) {
  const t = useTranslations("groups.memberStatuses");
  return <Badge variant={VARIANT[status]}>{t(status)}</Badge>;
}
