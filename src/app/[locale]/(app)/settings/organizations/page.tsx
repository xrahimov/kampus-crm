import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { OrganizationsPage } from "@/features/settings/organizations/organizations-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listOrganizations } from "@/server/services/settings/organizations.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("organizations") };
}

/** Site owner only (A-108): the centres this server hosts. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (current.actor.isSiteOwner !== true) return <Forbidden />;
  const organizations = await listOrganizations(current.actor);
  return <OrganizationsPage organizations={organizations} ownId={current.actor.organizationId} />;
}
