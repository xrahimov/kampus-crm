import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { GeneralSettings } from "@/features/settings/general/general-settings";
import { can } from "@/server/rbac/authorize";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listBranches } from "@/server/services/settings/branches.service";
import { listGradingSystems } from "@/server/services/settings/grading-systems.service";
import { getOrgSettings } from "@/server/services/settings/org-settings.service";
import { listPaymentMethods } from "@/server/services/settings/payment-methods.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("general") };
}

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.org")) return <Forbidden />;

  const [settings, branches, paymentMethods, gradingSystems] = await Promise.all([
    getOrgSettings(current.actor),
    listBranches(current.actor),
    listPaymentMethods(current.actor),
    listGradingSystems(current.actor),
  ]);

  return (
    <GeneralSettings
      settings={settings}
      branches={branches}
      paymentMethods={paymentMethods}
      gradingSystems={gradingSystems}
    />
  );
}
