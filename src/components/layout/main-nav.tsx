"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import {
  hasPermission,
  MODULE_VIEW_PERMISSION,
  MODULES,
  type ModuleKey,
} from "@/lib/rbac/permissions";
import { cn } from "@/lib/utils";

const MODULE_PATH: Record<ModuleKey, string> = {
  dashboard: "/dashboard",
  leads: "/leads",
  teachers: "/teachers",
  groups: "/groups",
  students: "/students",
  exams: "/exams",
  settings: "/settings",
  finance: "/finance",
  reports: "/reports",
};

/** Horizontal main navigation (EXP §0). Items the user may not view are hidden. */
export function MainNav({ permissions }: { permissions: string[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const visible = MODULES.filter((m) => hasPermission(permissions, MODULE_VIEW_PERMISSION[m]));

  return (
    <nav aria-label="Main" className="border-t bg-card">
      <ul className="mx-auto flex w-full max-w-screen-2xl items-center gap-1 overflow-x-auto px-2">
        {visible.map((module) => {
          const href = MODULE_PATH[module];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={module}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {t(module)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
