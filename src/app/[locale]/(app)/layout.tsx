import { setRequestLocale } from "next-intl/server";

import { AppShell } from "@/components/layout/app-shell";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Everything under (app) requires a valid session. The proxy only checks that
 * a cookie exists; this layout does the database lookup once per request.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const current = await getCurrentUser();
  if (!current) {
    return redirect({ href: "/login", locale });
  }

  return (
    <AppShell
      user={current.user}
      roles={current.roles}
      permissions={current.actor.permissions}
      branches={current.branches}
      activeBranch={current.activeBranch}
    >
      {children}
    </AppShell>
  );
}
