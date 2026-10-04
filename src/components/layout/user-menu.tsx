"use client";

import { Bell, LogOut, Receipt, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";

export function UserMenu({
  user,
  roles,
  canReceipt = false,
}: {
  user: { fullName: string; phone: string };
  roles: Array<{ code: string; name: string }>;
  /** Shows "Chek sozlamalari" (EXP §11) for users who may edit organisation settings. */
  canReceipt?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    startTransition(() => {
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={user.fullName} data-testid="user-menu">
          <UserRound />
          <span className="hidden max-w-40 truncate md:inline">{user.fullName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-muted-foreground">{t("auth.signedInAs")}</p>
          <p className="font-medium">{user.fullName}</p>
          <p className="text-xs text-muted-foreground">{user.phone}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("auth.role")}:{" "}
            {roles
              .map((r) => (t.has(`roles.${r.code}`) ? t(`roles.${r.code}`) : r.name))
              .join(", ")}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" data-testid="menu-notifications">
            <Bell />
            {t("notifications.title")}
          </Link>
        </DropdownMenuItem>
        {canReceipt && (
          <DropdownMenuItem asChild>
            <Link href="/settings/receipt" data-testid="menu-receipt">
              <Receipt />
              {t("settings.nav.receipt")}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} disabled={isPending} data-testid="sign-out">
          <LogOut />
          {t("auth.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
