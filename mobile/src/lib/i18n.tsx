import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDateUz, formatMoneyUz, type DateOptions } from "@kampus/lib/dates";
import en from "@kampus/messages/en.json";
import ru from "@kampus/messages/ru.json";
import uz from "@kampus/messages/uz.json";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IntlProvider, useFormatter, useLocale, useTranslations } from "use-intl";

import { ApiError, NetworkError } from "./api";

/*
 * The app speaks the site's three languages from the site's own message files
 * (../messages), so a text is written once for web and phones, and the keys
 * the server answers with ("errors.invalidCredentials") read the same in both.
 * Texts only the app has live under the "mobile" key of the same files.
 */

export const LOCALES = ["uz", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
const MESSAGES = { uz, ru, en } as const;
const STORAGE_KEY = "kampus.locale";
/** The centres' own time: lesson hours mean Tashkent time wherever the phone is. */
export const APP_TIME_ZONE = "Asia/Tashkent";

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The phone's language when Kampus speaks it, else Uzbek, as on the site. */
function deviceLocale(): Locale {
  try {
    for (const entry of getLocales()) {
      if (isLocale(entry.languageCode)) return entry.languageCode;
    }
  } catch {
    // No locale information: fall through to the default.
  }
  return "uz";
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: "uz",
  setLocale: () => undefined,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isLocale(stored)) setLocaleState(stored);
      })
      .catch(() => undefined);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone={APP_TIME_ZONE}
        // A missing text shows its key instead of crashing the screen.
        onError={() => undefined}
        getMessageFallback={({ namespace, key }) => (namespace ? `${namespace}.${key}` : key)}
      >
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocaleChoice() {
  return useContext(LocaleContext);
}

export { useTranslations };
export type Translate = ReturnType<typeof useTranslations>;

/** A failed call as a sentence in the person's language. */
export function errorText(t: Translate, error: unknown): string {
  if (error instanceof NetworkError) return t("mobile.offline");
  if (error instanceof ApiError) {
    const seconds = Number(error.meta?.retryAfterSeconds ?? 0);
    if (error.fields) {
      const first = Object.values(error.fields)[0]?.[0];
      if (first && t.has(first)) return t(first);
    }
    return t.has(error.message) ? t(error.message, { seconds }) : t("errors.internal");
  }
  return t("errors.internal");
}

/** Whole sums in soʻm. Uzbek is spelled by Kampus itself, as on the site (A-58). */
export function useMoney(): (value: number) => string {
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

/** Dates in the person's language; Uzbek is spelled by Kampus itself (A-58). */
export function useDate(): (date: Date, options: DateOptions) => string {
  const locale = useLocale();
  const format = useFormatter();
  return useCallback(
    (date: Date, options: DateOptions) =>
      locale === "uz" ? formatDateUz(date, options) : format.dateTime(date, options),
    [locale, format],
  );
}
