import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUser } from "@/server/auth/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const current = await requireCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dashboard.welcome", { name: current.user.fullName })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.phaseNote")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.yourRoles")}</CardTitle>
            <CardDescription>
              {current.roles
                .map((r) => (t.has(`roles.${r.code}`) ? t(`roles.${r.code}`) : r.name))
                .join(", ")}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.yourBranches")}</CardTitle>
            <CardDescription>
              {current.branches.map((b) => b.name).join(", ") || "—"}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("branch.active")}: {current.activeBranch?.name ?? t("common.allBranches")}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
