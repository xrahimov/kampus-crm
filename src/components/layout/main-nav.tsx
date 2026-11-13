"use client";

import {
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  Contact,
  Funnel,
  GraduationCap,
  HandCoins,
  House,
  Landmark,
  ListChecks,
  Megaphone,
  Settings2,
  Sparkles,
  type LucideIcon,
  UserRoundX,
  Users,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { canViewModule, MODULES, type ModuleKey } from "@/lib/rbac/permissions";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const MODULE_PATH: Record<ModuleKey, string> = {
  dashboard: "/dashboard",
  assistant: "/assistant",
  today: "/today",
  checking: "/checking",
  leads: "/leads",
  teachers: "/teachers",
  groups: "/groups",
  timetable: "/timetable",
  students: "/students",
  absences: "/absences",
  announcements: "/announcements",
  debts: "/debts",
  cashdesk: "/cashdesk",
  exams: "/exams",
  settings: "/settings",
  finance: "/finance",
  reports: "/reports",
};

const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
  dashboard: House,
  assistant: Sparkles,
  today: CalendarCheck,
  checking: ListChecks,
  leads: Funnel,
  teachers: GraduationCap,
  groups: Users,
  timetable: CalendarRange,
  students: Contact,
  absences: UserRoundX,
  announcements: Megaphone,
  debts: HandCoins,
  cashdesk: Wallet,
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

  const visible = MODULES.filter((m) => canViewModule(permissions, m));
  const waiting = useCheckingCount(visible.includes("checking"), pathname);

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
                {module === "checking" && waiting > 0 && (
                  <span
                    className="ml-auto rounded-full bg-sidebar-active px-1.5 text-xs font-medium text-sidebar tabular-nums"
                    data-testid="nav-checking-count"
                  >
                    {waiting > 99 ? "99+" : waiting}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** How many homework answers wait for the teacher; re-read on each page change. */
function useCheckingCount(enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void api<{ count: number }>("/homework/queue?count=1")
      .then((r) => {
        if (live) setCount(r.count);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled, pathname]);
  return count;
}
