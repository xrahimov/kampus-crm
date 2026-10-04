import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { IntegrationsPage } from "@/features/settings/integrations/integrations-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listIntegrations } from "@/server/services/integrations/integrations.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("integrations") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.integrations")) return <Forbidden />;
  return <IntegrationsPage integrations={await listIntegrations(current.actor)} />;
}
