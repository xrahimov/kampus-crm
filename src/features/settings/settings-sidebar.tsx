"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { hasPermission } from "@/lib/rbac/permissions";
import { cn } from "@/lib/utils";

import { SETTINGS_NAV } from "./settings-nav";

export function SettingsSidebar({ permissions }: { permissions: string[] }) {
  const t = useTranslations("settings.nav");
  const pathname = usePathname();
  const items = SETTINGS_NAV.filter((item) => hasPermission(permissions, item.permission));

  return (
    <nav aria-label={t("label")} className="lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:pb-0">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const base =
            "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors";
          // Sections of later phases have no page yet: a plain row, so nothing
          // prefetches a missing route or lands on a 404.
          if (item.phase) {
            return (
              <li key={item.key} className="shrink-0">
                <span
                  aria-disabled="true"
                  className={cn(base, "cursor-default text-muted-foreground opacity-70")}
                >
                  <span>{t(item.key)}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {t("phase", { phase: item.phase })}
                  </span>
                </span>
              </li>
            );
          }
          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  base,
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
