"use client";

import { useFormatter, useLocale } from "next-intl";
import { useCallback } from "react";

import { formatDateUz, type DateFormatter, type DateOptions } from "./dates";

/**
 * Locale-aware date formatting for the UI. English and Russian go through
 * next-intl (Intl); Uzbek is spelled by the app because ICU data for "uz"
 * differs between Node and browsers, which broke hydration and showed "M09".
 */
export function useDateFormat(): DateFormatter {
  const locale = useLocale();
  const format = useFormatter();
  return useCallback(
    (date: Date, options: DateOptions) =>
      locale === "uz" ? formatDateUz(date, options) : format.dateTime(date, options),
    [locale, format],
  );
}
