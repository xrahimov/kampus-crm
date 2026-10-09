"use client";

import {
  CalendarCheck,
  ChartColumn,
  ClipboardCheck,
  Contact,
  Funnel,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";
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
  today: "/today",
  leads: "/leads",
  teachers: "/teachers",
  groups: "/groups",
  students: "/students",
  debts: "/debts",
  exams: "/exams",
  settings: "/settings",
  finance: "/finance",
  reports: "/reports",
};

const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  dashboard: House,
  today: CalendarCheck,
  leads: Funnel,
  teachers: GraduationCap,
  groups: Users,
  students: Contact,
  debts: HandCoins,
  exams: ClipboardCheck,
  settings: Settings2,
  finance: Landmark,
  reports: ChartColumn,
};

/**
 * Main navigation (EXP §0), rendered inside the lapis sidebar on wide screens
 * and inside the drawer on small ones. Items the user may not view are hidden.
 * The active item carries a turquoise edge instead of a filled pill.
 */
export function MainNav({
  permissions,
  onNavigate,
}: {
  permissions: string[];
  /** Called after a link is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const visible = MODULES.filter((m) => hasPermission(permissions, MODULE_VIEW_PERMISSION[m]));

  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="flex flex-col gap-0.5">
        {visible.map((module) => {
          const href = MODULE_PATH[module];
          const Icon = MODULE_ICON[module];
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={module}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  "before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:transition-colors",
                  active
                    ? "bg-sidebar-muted font-medium text-white before:bg-sidebar-active"
                    : "text-sidebar-foreground before:bg-transparent hover:bg-sidebar-muted/70 hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0",
                    active ? "text-sidebar-active" : "opacity-80",
                  )}
                  strokeWidth={1.75}
                />
                <span className="truncate">{t(module)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
