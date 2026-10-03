import { setRequestLocale } from "next-intl/server";

import { SETTINGS_NAV } from "@/features/settings/settings-nav";
import { redirect } from "@/i18n/navigation";
import { hasPermission } from "@/lib/rbac/permissions";
import { requireCurrentUser } from "@/server/auth/current-user";

/** /settings opens the first page the user may see. */
export default async function SettingsIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const first = SETTINGS_NAV.find(
    (item) => !item.phase && hasPermission(current.actor.permissions, item.permission),
  );
  return redirect({ href: first?.href ?? "/dashboard", locale });
}
