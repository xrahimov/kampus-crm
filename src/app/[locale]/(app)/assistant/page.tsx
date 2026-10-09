import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AssistantPage } from "@/features/assistant/assistant-page";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { getAiClient } from "@/server/services/integrations/integrations.service";
import { prisma } from "@/server/db/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant");
  return { title: t("title") };
}

/** Questions over the centre's data, answered within the asker's permissions (A-149). */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "dashboard.view")) return <Forbidden />;
  const client = await getAiClient(prisma, current.actor.organizationId);
  return (
    <AssistantPage
      mode={client.name}
      model={client.model}
      canConfigure={can(current.actor, "settings.integrations")}
    />
  );
}
