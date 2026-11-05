"use client";

import { ArrowRight, BookOpen, LogOut, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type {
  StudentHomeDto,
  StudentHomeGroupDto,
} from "@/server/services/student-auth/student-home.service";

/** The signed-in student or parent's home (A-150): every profile, its groups and homework to do. */
export function StudentHome({ data }: { data: StudentHomeDto }) {
  const t = useTranslations("studentApp");
  const locale = useLocale();
  const fmt = useDateFormat();
  const short = (iso: string) => fmt(parseDateOnly(iso), { day: "numeric", month: "short" });

  return (
    <div className="space-y-4" data-testid="student-home">
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <Avatar name={data.account.name} src={data.account.photoUrl} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate" data-testid="student-home-name">
              {t("hello", { name: data.account.name })}
            </CardTitle>
            <CardDescription>
              {data.account.username ? `@${data.account.username}` : t("viaTelegram")}
              {data.account.phone ? ` · ${data.account.phone}` : ""}
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {data.profiles.map((p) => (
        <Card key={p.studentId} data-testid="student-profile">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {p.fullName}
              {p.relation === "CHILD" && <Badge variant="outline">{t("child")}</Badge>}
            </CardTitle>
            <CardDescription>{p.organizationName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {p.groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
            ) : (
              <div className="space-y-3">
                {p.groups.map((g) => (
                  <GroupRow key={g.membershipId} group={g} />
                ))}
              </div>
            )}
            <div className="space-y-2" data-testid="student-homework">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4 text-muted-foreground" /> {t("homeworkTitle")}
              </h3>
              {p.homework.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("homeworkNone")}</p>
              ) : (
                p.homework.map((h) => (
                  <Link
                    key={h.id}
                    href={`/class/${h.token}`}
                    className="block rounded-lg border p-3 text-sm hover:bg-muted/50"
                    data-testid="student-homework-item"
                  >
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {h.groupName}
                      <span className="font-normal text-muted-foreground">
                        · {t("lessonOf", { date: short(h.lessonDate) })}
                      </span>
                      {h.returned && <Badge variant="secondary">{t("returned")}</Badge>}
                      {h.dueDate && (
                        <span className="font-normal text-muted-foreground">
                          · {t("due", { date: short(h.dueDate) })}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{h.text}</p>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <p className="text-sm text-muted-foreground">{t("signOutHint")}</p>
          <div className="flex flex-wrap gap-2">
            <form method="post" action="/api/v1/student-auth/logout">
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" size="sm" data-testid="student-sign-out">
                <LogOut /> {t("signOut")}
              </Button>
            </form>
            <form method="post" action="/api/v1/student-auth/logout">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="everywhere" value="1" />
              <Button type="submit" variant="ghost" size="sm" data-testid="student-sign-out-all">
                {t("signOutAll")}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GroupRow({ group: g }: { group: StudentHomeGroupDto }) {
  const t = useTranslations("portal.family");
  const ta = useTranslations("studentApp");
  const ts = useTranslations("groups.memberStatuses");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const when = (iso: string) => {
    const d = parseDateOnly(iso);
    return `${fmt(d, { weekday: "short" })}, ${fmt(d, { day: "numeric", month: "short" })}`;
  };
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
      data-testid="student-group"
    >
      <div className="min-w-0 space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {g.groupName}
          <span className="font-normal text-muted-foreground">· {g.courseName}</span>
          {g.status !== "ACTIVE" && <Badge variant="outline">{ts(g.status)}</Badge>}
          {g.unreadNews > 0 && <Badge>{t("news", { count: g.unreadNews })}</Badge>}
          {g.live && (
            <Badge variant="success" data-testid="student-group-live">
              {ta("liveNow")}
            </Badge>
          )}
        </p>
        {g.teachers.length > 0 && (
          <p className="text-muted-foreground">{t("teachers", { names: g.teachers.join(", ") })}</p>
        )}
        <p className="text-muted-foreground">
          {g.nextLesson
            ? t("nextLesson", {
                when: when(g.nextLesson.date),
                time: `${g.nextLesson.startTime}–${g.nextLesson.endTime}`,
              })
            : t("noLesson")}
        </p>
        <p className={g.balance < 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
          {g.balance < 0
            ? t("debt", { amount: money(-g.balance) })
            : t("balance", { amount: money(g.balance) })}
        </p>
      </div>
      <Button asChild size="sm" variant={g.live ? "default" : "outline"}>
        <Link href={`/class/${g.token}`} data-testid="student-open-group">
          {g.live ? (
            <>
              <Video /> {ta("join")}
            </>
          ) : (
            <>
              {t("open")} <ArrowRight />
            </>
          )}
        </Link>
      </Button>
    </div>
  );
}
