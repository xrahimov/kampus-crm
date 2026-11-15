import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SwitchViewButton } from "@/components/layout/view-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Shown when a signed-in user opens a page their role may not view. Someone
 * in the teaching view who also holds another role is told that the page may
 * belong to that role, and can change sides right here (A-194).
 */
export async function Forbidden() {
  const t = await getTranslations();
  const current = await getCurrentUser();
  const view = current?.view;
  if (view?.canSwitch && view.current === "TEACHING") {
    const other = view.otherRoles.length === 1 ? view.otherRoles[0]! : null;
    const role = !other
      ? t("view.full")
      : t.has(`roles.${other.code}`)
        ? t(`roles.${other.code}`)
        : other.name;
    return (
      <Card data-testid="forbidden-in-view">
        <CardHeader className="flex-row items-center gap-3">
          <ShieldAlert className="size-6 text-muted-foreground" />
          <div>
            <CardTitle>{t("view.notInTeachingTitle")}</CardTitle>
            <CardDescription>{t("view.notInTeachingText", { role })}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SwitchViewButton view="FULL" label={t("view.switchTo", { role })} />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3">
        <ShieldAlert className="size-6 text-destructive" />
        <div>
          <CardTitle>{t("errors.forbiddenTitle")}</CardTitle>
          <CardDescription>{t("errors.forbidden")}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
