import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { FormsPage } from "@/features/settings/forms/forms-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listForms } from "@/server/services/leads/forms.service";
import { getLeadOptions } from "@/server/services/leads/leads.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("forms") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.catalog") || !can(current.actor, "leads.view")) {
    return <Forbidden />;
  }
  const [forms, options] = await Promise.all([
    listForms(current.actor),
    getLeadOptions(current.actor),
  ]);
  return <FormsPage forms={forms} options={options} locale={locale} />;
}
