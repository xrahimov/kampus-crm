import { getTranslations, setRequestLocale } from "next-intl/server";

import { SettingsSidebar } from "@/features/settings/settings-sidebar";
import { requireCurrentUser } from "@/server/auth/current-user";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("settings");
  const current = await requireCurrentUser();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsSidebar
          permissions={current.actor.permissions}
          siteOwner={current.actor.isSiteOwner === true}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
