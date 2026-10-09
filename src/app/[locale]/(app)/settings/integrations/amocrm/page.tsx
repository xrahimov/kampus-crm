import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { AmoCrmPage } from "@/features/settings/integrations/amocrm-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getIntegration } from "@/server/services/integrations/integrations.service";
import { listColumnOptions } from "@/server/services/leads/boards.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("amocrm") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.integrations")) return <Forbidden />;
  const [dto, columns] = await Promise.all([
    getIntegration(current.actor, "AMOCRM"),
    listColumnOptions(current.actor),
  ]);
  return <AmoCrmPage dto={dto} columns={columns} />;
}
