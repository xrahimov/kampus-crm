"use client";

import { useTranslations } from "next-intl";

/** Renders a react-hook-form error message, which is always an i18n key. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  const t = useTranslations();
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {t.has(message) ? t(message) : t("validation.required")}
    </p>
  );
}
