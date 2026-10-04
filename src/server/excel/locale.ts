import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { locales, type AppLocale } from "@/i18n/routing";

export type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** The UI language for an export: `?locale=` from the link, else the cookie, else Uzbek. */
export function exportLocale(request: NextRequest): AppLocale {
  const asked =
    request.nextUrl.searchParams.get("locale") ?? request.cookies.get("NEXT_LOCALE")?.value;
  return (locales as readonly string[]).includes(asked ?? "") ? (asked as AppLocale) : "uz";
}

/** Full-message translator (keys like "excel.columns.fullName") in the export's language. */
export async function exportTranslator(request: NextRequest): Promise<Translator> {
  return getTranslations({ locale: exportLocale(request) });
}
