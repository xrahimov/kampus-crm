import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AssistantPage } from "@/features/assistant/assistant-page";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { canUseAssistant } from "@/lib/rbac/permissions";
import { can } from "@/server/rbac/authorize";
import { getAiClient } from "@/server/services/integrations/integrations.service";
import { prisma } from "@/server/db/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant");
  return { title: t("title") };
}

/**
 * Questions over the centre's data, answered within the asker's permissions
 * (A-149); open to everyone with a Dashboard or a Today page (A-190).
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!canUseAssistant(current.actor.permissions)) return <Forbidden />;
  const client = await getAiClient(prisma, current.actor.organizationId);
  return (
    <AssistantPage
      userId={current.user.id}
      audience={can(current.actor, "dashboard.view") ? "office" : "teacher"}
      mode={client.name}
      model={client.model}
      canConfigure={can(current.actor, "settings.integrations")}
    />
  );
}
