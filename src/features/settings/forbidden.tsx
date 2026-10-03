import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Shown when a signed-in user opens a page their role may not view. */
export async function Forbidden() {
  const t = await getTranslations("errors");
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <ShieldAlert className="size-6 text-destructive" />
        <div>
          <CardTitle>{t("forbiddenTitle")}</CardTitle>
          <CardDescription>{t("forbidden")}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
