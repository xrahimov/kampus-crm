import { AtSign, Clock, MapPin, Phone, Send } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { KampusMark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PublicLeadForm } from "@/features/leads/public-form";
import { Link } from "@/i18n/navigation";
import { APP_TIME_ZONE, formatDateUz, formatMoneyUz, parseDateOnly } from "@/lib/dates";
import type { PublicCentreDto } from "@/server/services/public/centre-page.service";

/* Server-side formatting in the visitor's language; Uzbek is spelled by the app (see lib/dates). */
function money(locale: string, value: number): string {
  if (locale === "uz") return formatMoneyUz(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "UZS",
    maximumFractionDigits: 0,
  }).format(value);
}
function date(locale: string, iso: string): string {
  const d = parseDateOnly(iso);
  if (locale === "uz") return formatDateUz(d, { dateStyle: "medium" }, undefined);
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}
/** Monday = 1 … Sunday = 7; 2024-01-01 was a Monday. */
function weekday(locale: string, day: number): string {
  const d = new Date(Date.UTC(2024, 0, day, 12));
  if (locale === "uz") return formatDateUz(d, { weekday: "short" }, APP_TIME_ZONE);
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d);
}
/** "@centre" or a full link → the link. */
function socialHref(value: string, base: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}/${v.replace(/^@/, "").replace(/^.*\//, "")}`;
}

/**
 * A centre's public page (A-121): what it teaches, when, with whom and how to
 * sign up. One page for every centre on the server; the sign-up form is the
 * centre's lead form, so a visitor lands on the leads board.
 */
export async function CentrePage({
  centre,
  locale,
  inviteCode,
  courseId,
}: {
  centre: PublicCentreDto;
  locale: string;
  /** `?ref=` from a student's invite link (A-120). */
  inviteCode: string | null;
  /** `?course=`: the course the visitor pressed "Sign up" on. */
  courseId: string | null;
}) {
  const t = await getTranslations("publicPage");
  const tApp = await getTranslations("app");
  const course = centre.courses.find((c) => c.id === courseId) ?? null;
  const contacts = [
    centre.phone && {
      key: "phone",
      icon: Phone,
      label: centre.phone,
      href: `tel:${centre.phone.replace(/[^\d+]/g, "")}`,
    },
    centre.telegram && {
      key: "telegram",
      icon: Send,
      label: t("telegram"),
      href: socialHref(centre.telegram, "https://t.me"),
    },
    centre.instagram && {
      key: "instagram",
      icon: AtSign,
      label: t("instagram"),
      href: socialHref(centre.instagram, "https://instagram.com"),
    },
  ].filter((c): c is Exclude<typeof c, null | "" | undefined> => Boolean(c));

  return (
    <div className="min-h-screen bg-background" data-testid="public-centre">
      <header className="bg-sidebar text-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            {centre.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={centre.logoUrl}
                alt=""
                className="h-9 w-auto rounded-sm bg-white/90 p-0.5"
              />
            ) : (
              <KampusMark className="size-8 text-sidebar-active" />
            )}
            <span className="text-lg font-semibold tracking-tight">{centre.name}</span>
          </div>
          <div className="flex items-center gap-2 [&_button]:text-white">
            <LocaleSwitcher />
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
              <Link href="/login">{t("signIn")}</Link>
            </Button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:pb-16 sm:pt-10">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {centre.name}
          </h1>
          {centre.intro && (
            <p className="mt-4 max-w-2xl text-base text-white/80 sm:text-lg">{centre.intro}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="saffron" size="lg">
              <a href="#signup">{t("cta")}</a>
            </Button>
            {contacts.map((c) => (
              <Button
                key={c.key}
                asChild
                variant="outline"
                size="lg"
                className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <a href={c.href} target={c.key === "phone" ? undefined : "_blank"} rel="noreferrer">
                  <c.icon className="size-4" aria-hidden /> {c.label}
                </a>
              </Button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {centre.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {centre.address}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />{" "}
              {t("hours", { from: centre.workStart, to: centre.workEnd })}
            </span>
            {centre.branches.length > 1 && (
              <span>{t("branches", { names: centre.branches.join(", ") })}</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-12 px-4 py-10">
        <section aria-labelledby="courses-title">
          <h2 id="courses-title" className="text-2xl font-semibold tracking-tight">
            {t("coursesTitle")}
          </h2>
          {centre.courses.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("noCourses")}</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {centre.courses.map((c) => (
                <li key={c.id}>
                  <Card className="h-full" data-testid="public-course">
                    <div
                      className="h-1.5 rounded-t-lg"
                      style={{ backgroundColor: c.color ?? "var(--sidebar-active)" }}
                      aria-hidden
                    />
                    <CardHeader>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      {c.description && <CardDescription>{c.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-lg font-semibold tabular-nums">
                        {t("perMonth", { price: money(locale, c.price) })}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <Badge variant="secondary">
                          {t("duration", { count: c.durationMonths })}
                        </Badge>
                        <Badge variant="outline">{t("groupsCount", { count: c.groups })}</Badge>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={`?course=${c.id}#signup`}>{t("enrol")}</a>
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="schedule-title">
          <h2 id="schedule-title" className="text-2xl font-semibold tracking-tight">
            {t("scheduleTitle")}
          </h2>
          {centre.groups.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("noSchedule")}</p>
          ) : (
            <Card className="mt-4 overflow-x-auto">
              <Table data-testid="public-schedule">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.group")}</TableHead>
                    <TableHead>{t("columns.days")}</TableHead>
                    <TableHead>{t("columns.time")}</TableHead>
                    <TableHead>{t("columns.teacher")}</TableHead>
                    {centre.branches.length > 1 && <TableHead>{t("columns.branch")}</TableHead>}
                    <TableHead>{t("columns.starts")}</TableHead>
                    <TableHead className="text-right">{t("columns.seats")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {centre.groups.map((g) => (
                    <TableRow key={g.id} data-testid="public-group">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: g.color ?? "var(--sidebar-active)" }}
                            aria-hidden
                          />
                          <div>
                            <div className="font-medium">{g.courseName}</div>
                            <div className="text-xs text-muted-foreground">{g.name}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{g.weekdays.map((d) => weekday(locale, d)).join(", ")}</TableCell>
                      <TableCell className="tabular-nums">{g.times.join(", ")}</TableCell>
                      <TableCell>{g.teachers.join(", ") || "—"}</TableCell>
                      {centre.branches.length > 1 && <TableCell>{g.branchName}</TableCell>}
                      <TableCell className="tabular-nums">{date(locale, g.startDate)}</TableCell>
                      <TableCell className="text-right">
                        {g.seatsLeft === null ? (
                          "—"
                        ) : (
                          <Badge variant={g.seatsLeft === 0 ? "secondary" : "outline"}>
                            {t("seatsLeft", { count: g.seatsLeft })}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>

        {centre.teachers.length > 0 && (
          <section aria-labelledby="teachers-title">
            <h2 id="teachers-title" className="text-2xl font-semibold tracking-tight">
              {t("teachersTitle")}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {centre.teachers.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  data-testid="public-teacher"
                >
                  {u.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.photoUrl}
                      alt=""
                      className="size-12 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-accent-foreground">
                      {u.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? "")
                        .join("")}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.fullName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.courses.join(", ")}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="signup" aria-labelledby="signup-title" className="scroll-mt-6">
          <Card className="mx-auto max-w-lg">
            <CardHeader>
              <CardTitle id="signup-title" className="text-xl">
                {t("signupTitle")}
              </CardTitle>
              <CardDescription>
                {centre.formSlug
                  ? t("signupIntro", { organization: centre.name })
                  : t("signupClosed")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {centre.formSlug ? (
                <PublicLeadForm
                  slug={centre.formSlug}
                  inviteCode={inviteCode}
                  defaultComment={course ? t("courseInterest", { name: course.name }) : null}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {contacts.map((c) => (
                    <Button key={c.key} asChild variant="outline">
                      <a
                        href={c.href}
                        target={c.key === "phone" ? undefined : "_blank"}
                        rel="noreferrer"
                      >
                        <c.icon className="size-4" aria-hidden /> {c.label}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground">
          <span>{centre.name}</span>
          <span className="inline-flex items-center gap-1.5">
            <KampusMark className="size-4" /> {tApp("poweredBy")}
          </span>
        </div>
      </footer>
    </div>
  );
}
