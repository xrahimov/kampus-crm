import { getTranslations } from "next-intl/server";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModuleKey } from "@/lib/rbac/permissions";

/** Placeholder page for modules that arrive in a later phase (ARCHITECTURE.md §7). */
export async function ComingSoon({ module, phase }: { module: ModuleKey; phase: number }) {
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t(`nav.${module}`)}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t(`nav.${module}`)}</CardTitle>
          <CardDescription>{t("common.comingSoon", { phase })}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
