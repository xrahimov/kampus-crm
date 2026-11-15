"use client";

import {
  CalendarCheck,
  CalendarRange,
  ChartColumn,
  ChevronDown,
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
import { useState } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { canViewModule, MODULES, type ModuleKey } from "@/lib/rbac/permissions";
import type { StaffView } from "@/lib/rbac/views";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { cn } from "@/lib/utils";

import { useCheckingCount } from "./use-checking-count";

export const MODULE_PATH: Record<ModuleKey, string> = {
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

export const MODULE_ICON: Record<ModuleKey, LucideIcon> = {
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

/** One row of the list: a 40px link and the 2px gap under it. */
const ROW = 42;

/**
 * What a teacher opens every day (A-194). In the teaching view these four are
 * the menu; whatever else the person may see waits folded under "More".
 */
export const TEACHING_PRIMARY: readonly ModuleKey[] = ["today", "checking", "groups", "students"];

/** The menu of a view: the rows always shown, and the rows behind "More". */
export function navModules(
  permissions: readonly string[],
  view: StaffView,
): { primary: ModuleKey[]; more: ModuleKey[] } {
  const visible = MODULES.filter((m) => canViewModule(permissions, m));
  if (view !== "TEACHING") return { primary: visible, more: [] };
  return {
    primary: TEACHING_PRIMARY.filter((m) => visible.includes(m)),
    more: visible.filter((m) => !TEACHING_PRIMARY.includes(m)),
  };
}

/**
 * Main navigation (EXP §0), rendered inside the lapis sidebar on wide screens
 * and inside the drawer on small ones. Items the user may not view are hidden.
 * The active item carries a turquoise edge instead of a filled pill, and that
 * marker is one element which glides to the item that was chosen (A-192): it
 * sets off on the click, before the next page has arrived.
 */
export function MainNav({
  permissions,
  view = "FULL",
  onNavigate,
}: {
  permissions: string[];
  /** The teaching view shows a short menu and folds the rest under "More" (A-194). */
  view?: StaffView;
  /** Called after a link is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  const { primary, more } = navModules(permissions, view);
  const all = [...primary, ...more];
  const waiting = useCheckingCount(all.includes("checking"), pathname);
  // The item just chosen, until the address catches up with it.
  const [chosen, setChosen] = useState<{ module: ModuleKey; from: string } | null>(null);
  const [moreOpen, setMoreOpen] = useStoredFlag("kampus.nav.more");

  const here = all.find((m) => {
    const href = MODULE_PATH[m];
    return pathname === href || pathname.startsWith(`${href}/`);
  });
  const lit = chosen && chosen.from === pathname ? chosen.module : here;
  // "More" unfolds by itself while the page that is open lives under it.
  const unfolded = more.length > 0 && (moreOpen || (here !== undefined && more.includes(here)));
  const visible = unfolded ? all : primary;
  // The marker's row: the fold button takes one row between the two parts.
  const litAt = lit ? visible.indexOf(lit) : -1;
  const litIndex = litAt >= primary.length ? litAt + 1 : litAt;
  const foldLocked = here !== undefined && more.includes(here);

  const row = (module: ModuleKey, folded = false) => {
    const href = MODULE_PATH[module];
    const Icon = MODULE_ICON[module];
    const active = module === here;
    const marked = module === lit;
    return (
      <li key={module} className={folded ? "animate-rise" : undefined}>
        <Link
          href={href}
          onClick={() => {
            setChosen({ module, from: pathname });
            onNavigate?.();
          }}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group/nav relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-200",
            marked
              ? "font-medium text-white"
              : "text-sidebar-foreground hover:bg-sidebar-muted/60 hover:text-white",
          )}
        >
          <Icon
            className={cn(
              "size-[18px] shrink-0 transition-[color,opacity,transform] duration-300 ease-arrive",
              marked
                ? "scale-110 text-sidebar-active"
                : "opacity-80 group-hover/nav:translate-x-0.5 group-hover/nav:opacity-100",
            )}
            strokeWidth={1.75}
          />
          <span className="truncate">{t(module)}</span>
          {module === "checking" && waiting > 0 && (
            <span
              key={waiting}
              className="ml-auto animate-pop rounded-full bg-sidebar-active px-1.5 text-xs font-medium text-sidebar tabular-nums"
              data-testid="nav-checking-count"
            >
              {waiting > 99 ? "99+" : waiting}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="relative flex flex-col gap-0.5">
        {litIndex >= 0 && (
          <li
            aria-hidden="true"
            data-testid="nav-marker"
            className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-md bg-sidebar-muted shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] transition-transform duration-300 ease-arrive before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-sidebar-active"
            style={{ transform: `translateY(${litIndex * ROW}px)` }}
          />
        )}
        {primary.map((module) => row(module))}
        {more.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(!unfolded)}
              disabled={foldLocked}
              aria-expanded={unfolded}
              data-testid="nav-more"
              className="group/nav flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-muted/60 hover:text-white disabled:pointer-events-none"
            >
              <ChevronDown
                className={cn(
                  "size-[18px] shrink-0 opacity-80 transition-transform duration-300 ease-arrive",
                  unfolded && "rotate-180",
                )}
                strokeWidth={1.75}
              />
              <span className="truncate">{t("more")}</span>
            </button>
          </li>
        )}
        {unfolded && more.map((module) => row(module, true))}
      </ul>
    </nav>
  );
}
