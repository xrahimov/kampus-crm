import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { SmsTemplatesPage } from "@/features/settings/sms/sms-templates-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import { listSmsCategories, listSmsTemplates } from "@/server/services/sms/templates.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("sms") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "settings.catalog")) return <Forbidden />;
  const [categories, templates] = await Promise.all([
    listSmsCategories(current.actor),
    listSmsTemplates(current.actor),
  ]);
  return <SmsTemplatesPage categories={categories} templates={templates} canEdit />;
}
