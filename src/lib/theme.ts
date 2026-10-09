/*
 * Light, dark or the device's choice (round 2 F7, A-136). The choice lives in a
 * cookie on this device, so it holds across sign-ins and on the public pages;
 * the server renders nothing theme-specific, and an inline script in <head>
 * applies the class before the first paint, so there is no flash.
 */

export const THEME_COOKIE = "kampus_theme";
export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

/** The theme to show for a choice, given what the device prefers. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): "light" | "dark" {
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

/** The cookie's value from `document.cookie`, or null. */
export function themeCookieValue(cookie: string): string | null {
  const match = cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark|system)`));
  return match ? match[1]! : null;
}

/** Applies a theme to the document: the `dark` class and the browser's own colour scheme. */
export function applyTheme(theme: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Runs in <head> before React: reads the cookie and sets the class. Kept to the
 * same logic as above, written out so it needs no bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var c=m?m[1]:"system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
