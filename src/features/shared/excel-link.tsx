"use client";

import { FileSpreadsheet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * The reference's EXCEL button (A-24): a plain download link to an `/api/v1/...xlsx`
 * route, carrying the current filters and the UI language for the headers.
 */
export function ExcelLink({
  path,
  params,
  label,
  testId,
  size = "sm",
  disabled,
}: {
  /** Path under /api/v1, e.g. "/students/export.xlsx". */
  path: string;
  params?: URLSearchParams | Record<string, string | null | undefined>;
  label?: string;
  testId?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  const t = useTranslations("excel");
  const locale = useLocale();
  const search = new URLSearchParams(params instanceof URLSearchParams ? params : undefined);
  if (params && !(params instanceof URLSearchParams)) {
    for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  }
  search.delete("page");
  search.set("locale", locale);
  if (disabled) {
    return (
      <Button variant="outline" size={size} disabled data-testid={testId}>
        <FileSpreadsheet /> {label ?? t("export")}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size={size}>
      <a href={`/api/v1${path}?${search.toString()}`} download data-testid={testId}>
        <FileSpreadsheet /> {label ?? t("export")}
      </a>
    </Button>
  );
}
