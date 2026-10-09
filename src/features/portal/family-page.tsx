"use client";

import { ArrowRight, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { FamilyPortalDto } from "@/server/services/students/family-portal.service";

/** The parents' page (A-130): each child with their groups, and a way into each child's own page. */
export function FamilyPortalPage({ data }: { data: FamilyPortalDto }) {
  const t = useTranslations("portal.family");
  const ts = useTranslations("groups.memberStatuses");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const when = (iso: string) => {
    const d = parseDateOnly(iso);
    return `${fmt(d, { weekday: "short" })}, ${fmt(d, { day: "numeric", month: "short" })}`;
  };

  return (
    <div className="space-y-4" data-testid="family-portal">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" data-testid="family-portal-title">
            <Users className="size-5 text-muted-foreground" />{" "}
            {t("title", { name: data.familyName })}
          </CardTitle>
          <CardDescription>{t("description", { centre: data.organizationName })}</CardDescription>
        </CardHeader>
      </Card>
      {data.children.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{t("noChildren")}</CardContent>
        </Card>
      )}
      {data.children.map((child) => (
        <Card key={child.id} data-testid="family-child">
          <CardHeader>
            <CardTitle className="text-base">{child.fullName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {child.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
            ) : (
              child.groups.map((g) => (
                <div
                  key={g.membershipId}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                  data-testid="family-group"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {g.groupName}
                      <span className="font-normal text-muted-foreground">· {g.courseName}</span>
                      {g.status !== "ACTIVE" && <Badge variant="outline">{ts(g.status)}</Badge>}
                      {g.unreadNews > 0 && <Badge>{t("news", { count: g.unreadNews })}</Badge>}
                    </p>
                    {g.teachers.length > 0 && (
                      <p className="text-muted-foreground">
                        {t("teachers", { names: g.teachers.join(", ") })}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {g.nextLesson
                        ? t("nextLesson", {
                            when: when(g.nextLesson.date),
                            time: `${g.nextLesson.startTime}–${g.nextLesson.endTime}`,
                          })
                        : t("noLesson")}
                    </p>
                    <p
                      className={
                        g.balance < 0 ? "font-medium text-destructive" : "text-muted-foreground"
                      }
                    >
                      {g.balance < 0
                        ? t("debt", { amount: money(-g.balance) })
                        : t("balance", { amount: money(g.balance) })}
                      {g.nextPaymentDate &&
                        ` · ${t("nextPayment", { date: fmt(parseDateOnly(g.nextPaymentDate), { day: "numeric", month: "short" }) })}`}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/class/${g.token}`} data-testid="family-open-page">
                      {t("open")} <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
      <p className="text-center text-xs text-muted-foreground">{t("footer")}</p>
    </div>
  );
}
