import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CoinsSettingsPage } from "@/features/settings/coins/coins-settings-page";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getCoinSettings, listCoinReasons } from "@/server/services/coins/coins.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("coins") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.org")) return <Forbidden />;
  const [settings, reasons] = await Promise.all([
    getCoinSettings(current.actor),
    listCoinReasons(current.actor),
  ]);
  return <CoinsSettingsPage settings={settings} reasons={reasons} canEdit />;
}
