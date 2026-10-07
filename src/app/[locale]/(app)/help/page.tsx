import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { audienceForRoles } from "@/features/help/audience";
import { getHelpContent } from "@/features/help/content";
import { HelpHome } from "@/features/help/help-home";
import { requireCurrentUser } from "@/server/auth/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const content = getHelpContent(locale);
  return (
    <HelpHome
      content={content}
      defaultAudience={audienceForRoles(current.roles.map((r) => r.code))}
    />
  );
}
