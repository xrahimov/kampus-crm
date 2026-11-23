import { useState } from "react";

import { useTranslations } from "@/lib/i18n";

import { Field } from "./field";

/** "2026-11-23" as people here write it: "23.11.2026". */
export function isoToTyped(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/** "23.11.2026" (or with / or -) as an ISO day; null when it is not a real day yet. */
export function typedToIso(typed: string): string | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(typed.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Puts the dots in while digits are typed: "23112026" becomes "23.11.2026". */
function withDots(text: string): string {
  if (/[./-]/.test(text)) return text.replace(/[^\d./-]/g, "").slice(0, 10);
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

/**
 * A day typed as day.month.year, the way dates are written here. `value` is
 * the ISO day or null; `onChange` gets null while what is typed is not a day.
 * An empty field is fine unless the form says otherwise through `error`.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  testID,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
  testID?: string;
}) {
  const t = useTranslations();
  const [typed, setTyped] = useState(isoToTyped(value));
  // The form put another day in (a reset): show it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== typedToIso(typed)) setTyped(isoToTyped(value));
  }
  const unfinished = typed.trim() !== "" && typedToIso(typed) === null;
  return (
    <Field
      label={label}
      value={typed}
      onChangeText={(text) => {
        const next = withDots(text);
        setTyped(next);
        const iso = typedToIso(next);
        setSeen(iso);
        onChange(iso);
      }}
      placeholder={t("mobile.office.datePlaceholder")}
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      error={error ?? (unfinished ? t("validation.date") : null)}
      testID={testID}
    />
  );
}
