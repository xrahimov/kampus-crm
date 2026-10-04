import { getTranslations } from "next-intl/server";

import type { Actor } from "@/server/rbac/authorize";

import { Link } from "@/i18n/navigation";

import { unreadCount } from "@/server/services/dashboard/notifications.service";

import { BranchSelector } from "./branch-selector";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import { PayButton } from "@/features/payments/pay-button";

import { LocaleSwitcher } from "./locale-switcher";
import { MainNav } from "./main-nav";
import { UserMenu } from "./user-menu";

export interface AppShellProps {
  actor: Actor;
  user: { id: string; fullName: string; phone: string; photoUrl: string | null };
  roles: Array<{ code: string; name: string }>;
  permissions: string[];
  branches: Array<{ id: string; name: string }>;
  activeBranch: { id: string; name: string } | null;
  children: React.ReactNode;
}

export async function AppShell({
  actor,
  user,
  roles,
  permissions,
  branches,
  activeBranch,
  children,
}: AppShellProps) {
  const t = await getTranslations();
  const canChooseAll = permissions.includes("*") || permissions.includes("settings.org");
  const canPay = permissions.includes("*") || permissions.includes("payments.create");
  const canReceipt = permissions.includes("*") || permissions.includes("settings.org");
  const unread = await unreadCount(actor);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-3 px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold tracking-tight text-primary"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              K
            </span>
            <span className="hidden sm:inline">{t("app.name")}</span>
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <GlobalSearch />
            {canPay && <PayButton />}
            <BranchSelector
              branches={branches}
              activeBranch={activeBranch}
              canChooseAll={canChooseAll}
            />
            <LocaleSwitcher />
            <NotificationBell initialUnread={unread} />
            <UserMenu user={user} roles={roles} canReceipt={canReceipt} />
          </div>
        </div>
        <MainNav permissions={permissions} />
      </header>

      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
