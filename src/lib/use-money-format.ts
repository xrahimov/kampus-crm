"use client";

import { useFormatter, useLocale } from "next-intl";
import { useCallback } from "react";

import { formatMoneyUz } from "./dates";

/** Whole UZS amounts; Uzbek is spelled by the app for the same reason as dates. */
export function useMoneyFormat(): (value: number) => string {
  const locale = useLocale();
  const format = useFormatter();
  return useCallback(
    (value: number) =>
      locale === "uz"
        ? formatMoneyUz(value)
        : format.number(value, { style: "currency", currency: "UZS", maximumFractionDigits: 0 }),
    [locale, format],
  );
}
