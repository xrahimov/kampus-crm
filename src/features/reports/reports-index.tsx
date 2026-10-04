"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { hasPermission } from "@/lib/rbac/permissions";

import { REPORTS_NAV } from "./reports-nav";

/** "/reports": one card per report page (EXP §10); later phases are listed greyed out. */
export function ReportsIndex({ permissions }: { permissions: string[] }) {
  const t = useTranslations("reports");
  const items = REPORTS_NAV.filter((item) => hasPermission(permissions, item.permission));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) =>
          item.phase ? (
            <Card key={item.key} className="opacity-70" aria-disabled="true">
              <CardContent className="flex items-center justify-between pt-6">
                <span className="font-medium text-muted-foreground">{t(`items.${item.key}`)}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {t("phase", { phase: item.phase })}
                </span>
              </CardContent>
            </Card>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="group"
              data-testid={`report-${item.key}`}
            >
              <Card className="transition-colors group-hover:border-primary">
                <CardContent className="flex items-center justify-between pt-6">
                  <span className="font-medium">{t(`items.${item.key}`)}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
