import { useState } from "react";

import { useTranslations } from "@/lib/i18n";

import { Field } from "./field";

/** "9:5" or "0905" as "09:05"; null when it is not a time of day yet. */
export function typedToTime(typed: string): string | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(typed.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/** Puts the colon in while digits are typed: "1930" becomes "19:30". */
function withColon(text: string): string {
  if (/[:.]/.test(text))
    return text
      .replace(/[^\d:.]/g, "")
      .replace(".", ":")
      .slice(0, 5);
  const digits = text.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * A time of day typed as hours and minutes, "19:30". `value` is the time or
 * null; `onChange` gets null while what is typed is not a time.
 */
export function TimeField({
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
  const [typed, setTyped] = useState(value ?? "");
  // The form put another time in (a reset): show it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== typedToTime(typed)) setTyped(value ?? "");
  }
  const unfinished = typed.trim() !== "" && typedToTime(typed) === null;
  return (
    <Field
      label={label}
      value={typed}
      onChangeText={(text) => {
        const next = withColon(text);
        setTyped(next);
        const time = typedToTime(next);
        setSeen(time);
        onChange(time);
      }}
      placeholder="00:00"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      error={error ?? (unfinished ? t("validation.time") : null)}
      testID={testID}
    />
  );
}
