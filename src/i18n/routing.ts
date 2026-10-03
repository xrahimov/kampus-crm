import { defineRouting } from "next-intl/routing";

export const locales = ["uz", "ru", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "uz",
  localePrefix: "always",
  localeCookie: { name: "kampus_locale", sameSite: "lax" },
});
