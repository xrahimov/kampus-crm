"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { weekdayLabel } from "@/features/groups/weekday";
import { Link } from "@/i18n/navigation";
import { CallFlow } from "@/features/video/call-flow";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";

import { PortalHomeworkTab } from "./homework-tab";
import { PortalMaterialsTab } from "./materials-tab";
import { PayCard } from "./pay-card";
import { TelegramCard } from "./telegram-card";
import type { Weekday } from "@/lib/validation/groups";
import type { PortalHomeworkDto } from "@/server/services/homework/homework.service";
import type { MaterialDto } from "@/server/services/materials/materials.service";
import type { PortalPayOptionsDto } from "@/server/services/payments/online-payments.service";
import type { PortalDto } from "@/server/services/portal/portal.service";
import type { PortalTelegramDto } from "@/server/services/telegram/student-telegram.service";
import type { ClassPageDto, JoinDto } from "@/server/services/video/video.service";

const POLL_MS = 5000;

async function joinClass(token: string): Promise<JoinDto> {
  const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      body?.error ?? { code: "INTERNAL", message: "errors.internal" },
    );
  }
  return (await response.json()) as JoinDto;
}

/**
 * A student's personal page (/class/<token>): the video lesson on top, then
 * their lessons, money and results. The call state is polled; the rest is
 * loaded with the page.
 */
export function PortalPage({
  token,
  initial,
  portal,
  homework,
  telegram,
  materials,
  pay,
  initialTab = "lessons",
}: {
  token: string;
  initial: ClassPageDto;
  portal: PortalDto;
  homework: PortalHomeworkDto[];
  telegram: PortalTelegramDto;
  materials: MaterialDto[];
  pay: PortalPayOptionsDto;
  initialTab?: "lessons" | "money";
}) {
  const t = useTranslations("portal");
  const tc = useTranslations("video.class");
  const th = useTranslations("help");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const [page, setPage] = useState(initial);

  // Keeps checking whether the teacher has started (or ended) the lesson.
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch(`/api/v1/public/class/${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      })
        .then((r) => (r.ok ? (r.json() as Promise<ClassPageDto>) : null))
        .then((next) => next && setPage(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [token]);

  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  const shortDate = (iso: string) => {
    const d = parseDateOnly(iso);
    return `${fmt(d, { weekday: "short" })}, ${fmt(d, { day: "numeric", month: "short" })}`;
  };
  const openHomework = homework.filter(
    (h) => !h.submission || h.submission.status === "RETURNED",
  ).length;
  const canPay = pay.providers.length > 0 && portal.money.monthlyPrice > 0;
  const showMoney =
    canPay ||
    portal.money.monthlyPrice > 0 ||
    portal.money.balance !== 0 ||
    portal.money.payments.length > 0;

  return (
    <div className="space-y-4" data-testid="portal">
      <Card>
        <CardHeader>
          <CardTitle data-testid="class-title">
            {tc("hello", { name: portal.student.fullName })}
          </CardTitle>
          <CardDescription>
            {tc("group", { group: portal.group.name, center: page.organizationName })}
            {portal.group.teachers.length > 0 && (
              <> · {t("teacher", { names: portal.group.teachers.join(", ") })}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!page.enabled ? (
            <Alert>{tc("disabled")}</Alert>
          ) : (
            <CallFlow
              role="STUDENT"
              name={portal.student.fullName}
              ready={Boolean(page.roomId)}
              waitingText={
                portal.nextLesson
                  ? t("nextLesson", {
                      date: shortDate(portal.nextLesson.date),
                      start: portal.nextLesson.startTime,
                      end: portal.nextLesson.endTime,
                    })
                  : tc("waiting")
              }
              join={() => joinClass(token)}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="portal-stats">
        <Stat label={t("stats.attendance")} value={pct(portal.stats.attendancePercent)} />
        <Stat
          label={t("stats.grade")}
          value={portal.stats.gradeAverage === null ? "—" : String(portal.stats.gradeAverage)}
        />
        <Stat label={t("stats.lessons")} value={String(portal.stats.lessonsHeld)} />
        <Stat label={t("stats.coins")} value={String(portal.student.coins)} />
      </div>

      <TelegramCard token={token} initial={telegram} />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue={initialTab === "money" && showMoney ? "money" : "lessons"}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="lessons">{t("tabs.lessons")}</TabsTrigger>
              <TabsTrigger value="homework" data-testid="portal-tab-homework">
                {t("tabs.homework")}
                {openHomework > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {openHomework}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="materials" data-testid="portal-tab-materials">
                {t("tabs.materials")}
              </TabsTrigger>
              {showMoney && <TabsTrigger value="money">{t("tabs.money")}</TabsTrigger>}
              <TabsTrigger value="results">{t("tabs.results")}</TabsTrigger>
              <TabsTrigger value="schedule">{t("tabs.schedule")}</TabsTrigger>
            </TabsList>

            <TabsContent value="lessons">
              {portal.lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("lessons.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("lessons.date")}</TableHead>
                      <TableHead>{t("lessons.topic")}</TableHead>
                      <TableHead>{t("lessons.attendance")}</TableHead>
                      <TableHead className="text-right">{t("lessons.grade")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portal.lessons.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap">
                          {shortDate(l.date)}
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                            {l.startTime}
                          </span>
                        </TableCell>
                        <TableCell>
                          {l.topic ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <AttendanceBadge status={l.attendance} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.grade === null ? "—" : l.grade}
                          {l.gradeComment && (
                            <div className="text-xs text-muted-foreground">{l.gradeComment}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="homework">
              <PortalHomeworkTab token={token} initial={homework} />
            </TabsContent>

            <TabsContent value="materials">
              <PortalMaterialsTab items={materials} />
            </TabsContent>

            {showMoney && (
              <TabsContent value="money" className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat
                    label={t("money.balance")}
                    value={money(portal.money.balance)}
                    tone={portal.money.balance < 0 ? "bad" : "good"}
                  />
                  <Stat label={t("money.monthly")} value={money(portal.money.monthlyPrice)} />
                  <Stat
                    label={t("money.nextPayment")}
                    value={portal.money.nextPaymentDate ? date(portal.money.nextPaymentDate) : "—"}
                  />
                </div>
                {portal.money.balance < 0 && (
                  <Alert>{t("money.debt", { amount: money(-portal.money.balance) })}</Alert>
                )}
                {canPay && <PayCard token={token} options={pay} />}
                {portal.money.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("money.empty")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("money.date")}</TableHead>
                        <TableHead>{t("money.month")}</TableHead>
                        <TableHead>{t("money.method")}</TableHead>
                        <TableHead className="text-right">{t("money.amount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portal.money.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">{date(p.paidAt)}</TableCell>
                          <TableCell>
                            {fmt(parseDateOnly(p.effectiveMonth), {
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                          <TableCell>{p.method ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {money(p.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            )}

            <TabsContent value="results" className="space-y-6">
              <section>
                <h3 className="mb-2 text-sm font-medium">{t("results.exams")}</h3>
                {portal.exams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("results.noExams")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("results.date")}</TableHead>
                        <TableHead>{t("results.name")}</TableHead>
                        <TableHead className="text-right">{t("results.score")}</TableHead>
                        <TableHead>{t("results.outcome")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portal.exams.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap">{date(e.date)}</TableCell>
                          <TableCell>{e.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {e.score === null ? "—" : `${e.score} / ${e.maxScore}`}
                          </TableCell>
                          <TableCell>
                            {!e.isPresent ? (
                              <Badge variant="muted">{t("results.missed")}</Badge>
                            ) : e.passed === null ? (
                              <Badge variant="muted">{t("results.pending")}</Badge>
                            ) : (
                              <Badge variant={e.passed ? "success" : "destructive"}>
                                {e.level ?? (e.passed ? t("results.passed") : t("results.failed"))}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
              <section>
                <h3 className="mb-2 text-sm font-medium">{t("results.tests")}</h3>
                {portal.tests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("results.noTests")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("results.date")}</TableHead>
                        <TableHead>{t("results.name")}</TableHead>
                        <TableHead className="text-right">{t("results.score")}</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portal.tests.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="whitespace-nowrap">
                            {fmt(new Date(a.submittedAt), { dateStyle: "medium" })}
                          </TableCell>
                          <TableCell>
                            {a.testName}
                            <div className="text-xs text-muted-foreground">{a.subject}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.score} / {a.maxScore}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{a.percent}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </TabsContent>

            <TabsContent value="schedule">
              {page.schedule.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("schedule.empty")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {page.schedule.map((s) => (
                    <li key={s.weekday} className="flex justify-between gap-2 py-2">
                      <span>{weekdayLabel(fmt, s.weekday as Weekday, "long")}</span>
                      <span className="tabular-nums">
                        {s.startTime} – {s.endTime}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {t("schedule.until", { date: date(portal.group.endDate) })}
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <p className="text-center text-sm">
        <Link
          href={`/class/${token}/help`}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          data-testid="portal-help"
        >
          <CircleHelp className="size-4" aria-hidden /> {th("portalLink")}
        </Link>
      </p>
    </div>
  );
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "text-lg font-semibold tabular-nums " +
          (tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function AttendanceBadge({ status }: { status: PortalDto["lessons"][number]["attendance"] }) {
  const t = useTranslations("groups.attendance");
  if (!status || status === "NOT_MARKED") return <span className="text-muted-foreground">—</span>;
  const variant = status === "PRESENT" ? "success" : status === "ABSENT" ? "destructive" : "muted";
  return <Badge variant={variant}>{t(status)}</Badge>;
}
