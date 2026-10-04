"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** "Dan" / "Gacha" date inputs used by every log page. */
export function DateRange({
  from,
  to,
  onChange,
  idPrefix,
}: {
  from?: string;
  to?: string;
  onChange: (key: "from" | "to", value: string | null) => void;
  idPrefix: string;
}) {
  const t = useTranslations("logs");
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-from`} className="text-xs text-muted-foreground">
          {t("from")}
        </Label>
        <Input
          id={`${idPrefix}-from`}
          type="date"
          value={from ?? ""}
          onChange={(e) => onChange("from", e.target.value || null)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-to`} className="text-xs text-muted-foreground">
          {t("to")}
        </Label>
        <Input
          id={`${idPrefix}-to`}
          type="date"
          value={to ?? ""}
          onChange={(e) => onChange("to", e.target.value || null)}
        />
      </div>
    </>
  );
}
