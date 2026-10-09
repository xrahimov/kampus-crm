/** Theme choice (A-136): cookie parsing and resolution against the device preference. */
import { describe, expect, it } from "vitest";

import {
  parseThemeChoice,
  resolveTheme,
  THEME_BOOT_SCRIPT,
  THEME_COOKIE,
  themeCookieValue,
} from "@/lib/theme";

describe("theme choice", () => {
  it("parses the cookie and falls back to the device", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice("blue")).toBe("system");
    expect(parseThemeChoice(null)).toBe("system");
  });

  it("resolves the device choice from the preference and fixed choices as they are", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("finds its own cookie among others", () => {
    expect(themeCookieValue(`kampus_session=abc; ${THEME_COOKIE}=dark; kampus_csrf=x`)).toBe(
      "dark",
    );
    expect(themeCookieValue(`${THEME_COOKIE}=system`)).toBe("system");
    expect(themeCookieValue("kampus_session=abc")).toBeNull();
    expect(themeCookieValue(`other_${THEME_COOKIE}=dark`)).toBeNull();
  });

  it("ships a boot script that reads the same cookie", () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_COOKIE);
    expect(THEME_BOOT_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_BOOT_SCRIPT.startsWith("(function(){")).toBe(true);
  });
});
