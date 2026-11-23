"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { MODULE_ICON, MODULE_PATH, navModules } from "./main-nav";
import { useCheckingCount } from "./use-checking-count";

/**
 * The teaching view on a phone (A-194): the four pages of a teacher's day sit
 * under the thumb, so the drawer is only needed for the rarely used rest.
 * The bar is a rounded pane of glass that floats over the page, with a
 * turquoise fill on the page you are on, as in the phone app (A-224, A-225).
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
      className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 lg:hidden print:hidden"
    >
      <ul className="pointer-events-auto mx-auto grid max-w-md auto-cols-fr grid-flow-col rounded-full border glass p-1.5">
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
                  "press relative isolate flex h-13 flex-col items-center justify-center gap-0.5 rounded-full text-[11px]",
                  // The fill of the page you are on grows in from the middle.
                  "before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-accent before:transition-[opacity,scale] before:duration-300 before:ease-arrive",
                  active
                    ? "font-medium text-accent-foreground before:scale-100 before:opacity-100"
                    : "text-muted-foreground before:scale-75 before:opacity-0",
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
