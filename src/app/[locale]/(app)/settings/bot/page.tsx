import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BotRecipientsPage } from "@/features/settings/bot/bot-recipients-page";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listBotRecipients } from "@/server/services/integrations/bot-recipients.service";
import { listBranches } from "@/server/services/settings/branches.service";
import { listStaff } from "@/server/services/staff/staff.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("bot") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.integrations")) return <Forbidden />;
  const [recipients, staffPage, branches] = await Promise.all([
    listBotRecipients(current.actor),
    listStaff(
      current.actor,
      "staff",
      { page: 1, pageSize: 100, skip: 0, take: 100, sort: { field: "fullName", direction: "asc" } },
      {},
    ),
    listBranches(current.actor),
  ]);
  return (
    <BotRecipientsPage
      recipients={recipients}
      staff={staffPage.items.map((s) => ({ id: s.id, fullName: s.fullName, phone: s.phone }))}
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}
