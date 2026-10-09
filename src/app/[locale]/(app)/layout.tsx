import { setRequestLocale } from "next-intl/server";

import { redirect as redirectTo } from "next/navigation";

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
    // The proxy let the cookie through, but no session matches it any more:
    // the cookie is cleared on the way to the sign-in page.
    redirectTo(`/api/v1/auth/expired?locale=${encodeURIComponent(locale)}`);
  }
  // A password someone else chose is used once: the person picks their own first (A-124).
  if (current.user.mustChangePassword) {
    return redirect({ href: "/change-password", locale });
  }

  return (
    <AppShell
      actor={current.actor}
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
