"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import type { LeaveReasonDto } from "@/server/services/reports/churn.service";

const OTHER = "__other";

/**
 * The reason picker shown when a student leaves or moves (A-92): the organisation's
 * configured reasons (Settings via the churn report's "SABABLARNI SOZLASH") plus free text.
 */
export function LeaveReasonField({
  kind,
  value,
  onChange,
  active,
  id = "leave-reason",
}: {
  kind: LeaveReasonDto["kind"];
  value: string;
  onChange: (value: string) => void;
  /** Load the list only while the dialog is open. */
  active: boolean;
  id?: string;
}) {
  const t = useTranslations("students.remove");
  const [reasons, setReasons] = useState<LeaveReasonDto[]>([]);
  const [picked, setPicked] = useState(OTHER);

  useEffect(() => {
    if (!active) return;
    api<LeaveReasonDto[]>("/leave-reasons")
      .then((rows) => setReasons(rows.filter((r) => r.kind === kind && r.isActive)))
      .catch(() => setReasons([]));
  }, [active, kind]);

  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setPicked(OTHER);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("reason")}</Label>
      {reasons.length > 0 && (
        <Select
          value={picked}
          onValueChange={(v) => {
            setPicked(v);
            onChange(v === OTHER ? "" : (reasons.find((r) => r.id === v)?.name ?? ""));
          }}
        >
          <SelectTrigger data-testid="leave-reason-select" aria-label={t("reason")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {reasons.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>{t("otherReason")}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {(picked === OTHER || reasons.length === 0) && (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="leave-reason-text"
        />
      )}
    </div>
  );
}
