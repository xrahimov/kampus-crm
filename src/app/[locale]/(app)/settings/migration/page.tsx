import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { hasPermission } from "@/lib/rbac/permissions";
import { Forbidden } from "@/features/settings/forbidden";
import { SoffImportPage } from "@/features/settings/migration/soff-import-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { listBranches } from "@/server/services/settings/branches.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("migration") };
}

/** Settings → Import from SOFF CRM (A-143): one upload per export of the vendor's CRM. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!hasPermission(current.actor.permissions, "students.create")) return <Forbidden />;
  const branches = (await listBranches(current.actor)).filter(
    (b) => b.isActive && current.actor.branchIds.includes(b.id),
  );
  return (
    <SoffImportPage
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      defaultBranchId={current.actor.activeBranchId ?? branches[0]?.id ?? ""}
    />
  );
}
