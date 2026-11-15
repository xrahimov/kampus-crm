"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { MODULE_ICON, MODULE_PATH, navModules } from "./main-nav";
import { useCheckingCount } from "./use-checking-count";

/**
 * The teaching view on a phone (A-194): the four pages of a teacher's day sit
 * under the thumb, so the drawer is only needed for the rarely used rest.
 */
export function TeachingTabBar({ permissions }: { permissions: string[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { primary } = navModules(permissions, "TEACHING");
  const waiting = useCheckingCount(primary.includes("checking"), pathname);
  if (primary.length < 2) return null;

  return (
    <nav
      aria-label={t("teachingBar")}
      data-testid="teaching-tab-bar"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
        {primary.map((module) => {
          const href = MODULE_PATH[module];
          const Icon = MODULE_ICON[module];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={module}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                  "before:absolute before:top-0 before:h-[3px] before:w-8 before:rounded-b-full before:transition-colors",
                  active
                    ? "font-medium text-foreground before:bg-ring"
                    : "text-muted-foreground before:bg-transparent",
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("size-5", active && "text-accent-foreground")}
                    strokeWidth={1.75}
                  />
                  {module === "checking" && waiting > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">
                      {waiting > 99 ? "99+" : waiting}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{t(module)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
