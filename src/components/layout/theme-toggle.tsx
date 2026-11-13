"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useSyncExternalStore } from "react";

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

  const button = useRef<HTMLButtonElement>(null);

  function onChange(next: string) {
    const value = parseThemeChoice(next);
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const flip = () => {
      document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
      applyTheme(resolveTheme(value, dark));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    };

    // The new colours open in a circle from this button (A-192), where the
    // browser can do it and the person has not asked for less motion.
    const root = document.documentElement;
    const changes = resolveTheme(value, dark) !== resolveTheme(choice, dark);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };
    if (!changes || calm || !doc.startViewTransition) return flip();

    const box = button.current?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : window.innerWidth;
    const y = box ? box.top + box.height / 2 : 0;
    const reach = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    root.dataset.themeFlip = "true";
    const transition = doc.startViewTransition(flip);
    void transition.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
          {
            duration: 560,
            easing: "cubic-bezier(0.65, 0, 0.35, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => undefined);
    void transition.finished.finally(() => {
      delete root.dataset.themeFlip;
    });
  }

  const Icon = ICONS[choice];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={button}
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
