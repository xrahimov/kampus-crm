"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTheme,
  parseThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_COOKIE,
  themeCookieValue,
  type ThemeChoice,
} from "@/lib/theme";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const CHANGE_EVENT = "kampus-theme";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}
const readChoice = (): ThemeChoice => parseThemeChoice(themeCookieValue(document.cookie));
const serverChoice = (): ThemeChoice => "system";

/** Light, dark or the device's choice (A-136), kept in a cookie on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations();
  // The cookie is the store; the server has none, so it renders the device choice.
  const choice = useSyncExternalStore(subscribe, readChoice, serverChoice);

  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme(resolveTheme("system", media.matches));
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [choice]);

  function onChange(next: string) {
    const value = parseThemeChoice(next);
    document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    applyTheme(resolveTheme(value, window.matchMedia("(prefers-color-scheme: dark)").matches));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const Icon = ICONS[choice];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.theme")}
          className={className}
          data-testid="theme-toggle"
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={choice} onValueChange={onChange}>
          {THEME_CHOICES.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} data-testid={`theme-${value}`}>
              {t(`theme.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
