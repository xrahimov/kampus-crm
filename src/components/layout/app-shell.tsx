import { getTranslations } from "next-intl/server";

import type { Actor } from "@/server/rbac/authorize";

import { KampusMark, KampusWordmark } from "@/components/brand/logo";
import { TileWall } from "@/components/brand/tile-wall";
import { Link } from "@/i18n/navigation";

import { unreadCount } from "@/server/services/dashboard/notifications.service";

import { BranchSelector } from "./branch-selector";
import { GlobalSearch } from "./global-search";
import { HelpLink } from "./help-link";
import { NotificationBell } from "./notification-bell";
import { AssistantLauncher } from "@/features/assistant/assistant-launcher";
import { PayButton } from "@/features/payments/pay-button";
import { canUseAssistant, hasPermission } from "@/lib/rbac/permissions";

import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { UserMenu } from "./user-menu";

export interface AppShellProps {
  actor: Actor;
  user: { id: string; fullName: string; phone: string; photoUrl: string | null };
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
  branches: Array<{ id: string; name: string }>;
  activeBranch: { id: string; name: string } | null;
  /** Shows "My salary" in the user menu (A-127). */
  canSalary?: boolean;
  children: React.ReactNode;
}

/**
 * App frame: a lapis sidebar carries the brand and the module list, a quiet
 * header carries search and the per-request controls, and the page sits on
 * porcelain. On small screens the sidebar folds into a drawer (MobileNav).
 */
export async function AppShell({
  actor,
  user,
  roles,
  permissions,
  branches,
  activeBranch,
  canSalary = false,
  children,
}: AppShellProps) {
  const t = await getTranslations();
  const canChooseAll = permissions.includes("*") || permissions.includes("settings.org");
  const canPay = permissions.includes("*") || permissions.includes("payments.create");
  const canReceipt = permissions.includes("*") || permissions.includes("settings.org");
  const unread = await unreadCount(actor);
  const appName = t("app.name");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 isolate hidden h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">
        {/* The same tiles as the sign-in wall, faint, at the foot of the sidebar (A-192). */}
        <TileWall
          id="sidebar-wall"
          quiet
          className="-z-10 [mask-image:linear-gradient(to_top,black,transparent_55%)]"
        />
        <div className="flex h-14 items-center px-5 text-white">
          <Link href="/dashboard" className="rounded-md focus-visible:outline-sidebar-active">
            <KampusWordmark name={appName} />
          </Link>
        </div>
        <MainNav permissions={permissions} />
        <HelpLink />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* The page is a porcelain sheet laid on the lapis frame: its corner by the sidebar is round (A-192). */}
        <header className="app-header sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:before:pointer-events-none lg:before:absolute lg:before:top-0 lg:before:left-0 lg:before:size-5 lg:before:bg-[radial-gradient(circle_at_100%_100%,transparent_1.25rem,var(--sidebar)_calc(1.25rem+0.5px))]">
          <div className="flex h-14 items-center gap-2 px-4 lg:px-6">
            <MobileNav permissions={permissions} appName={appName} />
            <Link href="/dashboard" className="lg:hidden" aria-label={appName}>
              <KampusMark />
            </Link>
            <GlobalSearch />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {canPay && <PayButton />}
              <BranchSelector
                branches={branches}
                activeBranch={activeBranch}
                canChooseAll={canChooseAll}
              />
              <LocaleSwitcher />
              <ThemeToggle />
              <NotificationBell initialUnread={unread} />
              <UserMenu user={user} roles={roles} canReceipt={canReceipt} canSalary={canSalary} />
            </div>
          </div>
        </header>

        <main className="w-full max-w-[96rem] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {canUseAssistant(permissions) && (
        <AssistantLauncher
          userId={user.id}
          userName={user.fullName}
          audience={hasPermission(permissions, "dashboard.view") ? "office" : "teacher"}
        />
      )}
    </div>
  );
}
