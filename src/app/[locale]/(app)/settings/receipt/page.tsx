import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { ReceiptSettings } from "@/features/settings/receipt/receipt-settings";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getReceiptSettings } from "@/server/services/settings/receipt-settings.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("receipt") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.org")) return <Forbidden />;
  const settings = await getReceiptSettings(current.actor);
  return <ReceiptSettings settings={settings} />;
}
