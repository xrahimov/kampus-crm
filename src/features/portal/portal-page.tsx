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
import { Link } from "@/i18n/navigation";
import { CallFlow } from "@/features/video/call-flow";
import { ApiError, type ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";

import { PortalAnnouncementsTab } from "./announcements-tab";
import { PortalChatTab } from "./chat-tab";
import { PortalCourseTab } from "./course-tab";
import { PortalGradebookCard } from "./gradebook-card";
import { PortalStreamTab } from "./stream-tab";
import { BadgeList } from "@/features/badges/badge-list";
import type { BadgeDto } from "@/lib/validation/badges";
import { PortalHomeworkTab } from "./homework-tab";
import { PortalTestsTab } from "./tests-tab";
import { PortalMaterialsTab } from "./materials-tab";
import { PayCard } from "./pay-card";
import { LessonRatingCell } from "./lesson-rating";
import { ReferralCard } from "./referral-card";
import { PortalScheduleTab } from "./schedule-tab";
import { TelegramCard } from "./telegram-card";
import type { PortalAnnouncementDto } from "@/server/services/announcements/announcements.service";
import type { PortalChatDto } from "@/server/services/chat/group-chat.service";
import type { PortalHomeworkDto } from "@/server/services/homework/homework.service";
import type { PortalCertificateDto } from "@/server/services/students/certificates.service";
import type { PortalTestDto } from "@/server/services/tests/portal-tests.service";
import type { PortalGradebookDto } from "@/server/services/gradebook/gradebook.service";
import type { StreamPostDto } from "@/server/services/stream/stream.service";
import type { PortalVocabDto } from "@/server/services/vocab/vocab.service";
import type { CourseProgressDto } from "@/server/services/progress/course-progress.service";
import type { PortalCourseDto } from "@/server/services/settings/topic-content.service";
import type { MaterialDto } from "@/server/services/materials/materials.service";
import type { PortalPayOptionsDto } from "@/server/services/payments/online-payments.service";
import type { PortalReferralDto } from "@/server/services/students/referrals.service";
import type { PortalDto } from "@/server/services/portal/portal.service";
import type { PortalScheduleDto } from "@/server/services/portal/reschedule.service";
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
  referral,
  announcements,
  chat,
  certificates = [],
  tests = [],
  course = null,
  progress = null,
  gradebook = null,
  badges = [],
  stream = [],
  vocab = null,
  schedule,
  initialTab = "lessons",
}: {
  token: string;
  initial: ClassPageDto;
  portal: PortalDto;
  homework: PortalHomeworkDto[];
  telegram: PortalTelegramDto;
  materials: MaterialDto[];
  pay: PortalPayOptionsDto;
  referral: PortalReferralDto | null;
  announcements: PortalAnnouncementDto[];
  chat: PortalChatDto;
  /** The student's certificates of graduation (A-140), with their public links. */
  certificates?: PortalCertificateDto[];
  /** The group's tests the student can take or has taken (A-145). */
  tests?: PortalTestDto[];
  /** The course's topics and the content open to the student (A-157). */
  course?: PortalCourseDto | null;
  /** Where the student stands in the course (A-159). */
  progress?: CourseProgressDto | null;
  /** Categories, weights and the final grade (A-162). */
  gradebook?: PortalGradebookDto | null;
  /** Achievements on top of coins (A-163). */
  badges?: BadgeDto[];
  /** The group's class stream (A-164). */
  stream?: StreamPostDto[];
  /** Flashcards (A-165). */
  vocab?: PortalVocabDto | null;
  /** Upcoming lessons and the move/cancel rules (A-166). */
  schedule: PortalScheduleDto;
  initialTab?: "lessons" | "money";
}) {
  const t = useTranslations("portal");
  const tc = useTranslations("video.class");
  const tb = useTranslations("badges");
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
  const unreadNews = announcements.filter((a) => !a.read).length;
  const openTests = tests.filter((x) => x.available).length;
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

      {badges.length > 0 && (
        <Card data-testid="portal-badges">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tb("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeList badges={badges} testId="portal-badge-list" />
          </CardContent>
        </Card>
      )}

      <TelegramCard token={token} initial={telegram} />
      {referral && <ReferralCard referral={referral} />}

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
              {course && course.total > 0 && (
                <TabsTrigger value="course" data-testid="portal-tab-course">
                  {t("tabs.course")}
                </TabsTrigger>
              )}
              <TabsTrigger value="chat" data-testid="portal-tab-chat">
                {t("tabs.chat")}
                {chat.unread > 0 && (
                  <span
                    className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground"
                    data-testid="portal-chat-unread"
                  >
                    {chat.unread}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="materials" data-testid="portal-tab-materials">
                {t("tabs.materials")}
              </TabsTrigger>
              <TabsTrigger value="stream" data-testid="portal-tab-stream">
                {t("tabs.stream")}
              </TabsTrigger>
              <TabsTrigger value="announcements" data-testid="portal-tab-announcements">
                {t("tabs.announcements")}
                {unreadNews > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {unreadNews}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="tests" data-testid="portal-tab-tests">
                {t("tabs.tests")}
                {openTests > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {openTests}
                  </span>
                )}
              </TabsTrigger>
              {showMoney && <TabsTrigger value="money">{t("tabs.money")}</TabsTrigger>}
              <TabsTrigger value="results" data-testid="portal-tab-results">
                {t("tabs.results")}
              </TabsTrigger>
              <TabsTrigger value="schedule">{t("tabs.schedule")}</TabsTrigger>
            </TabsList>

            <TabsContent value="lessons">
              {portal.nextLesson?.topic && (
                <p className="mb-3 text-sm" data-testid="portal-next-topic">
                  {t("lessons.nextTopic", { title: portal.nextLesson.topic })}
                </p>
              )}
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
                      <TableHead className="text-right">{t("lessons.yourRating")}</TableHead>
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
                          {l.studentNote && (
                            <p
                              className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground"
                              data-testid="portal-lesson-note"
                            >
                              {t("lessons.teacherNote")}: {l.studentNote}
                            </p>
                          )}
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
                        <TableCell className="text-right">
                          <LessonRatingCell token={token} lesson={l} />
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

            <TabsContent value="announcements">
              <PortalAnnouncementsTab token={token} items={announcements} />
            </TabsContent>

            <TabsContent value="stream">
              <PortalStreamTab token={token} initial={stream} />
            </TabsContent>

            <TabsContent value="chat">
              <PortalChatTab
                token={token}
                initial={chat}
                telegramLinked={telegram.chats.length > 0}
              />
            </TabsContent>

            {course && course.total > 0 && (
              <TabsContent value="course">
                <PortalCourseTab token={token} course={course} progress={progress} vocab={vocab} />
              </TabsContent>
            )}
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

            <TabsContent value="tests">
              <PortalTestsTab token={token} initial={tests} />
            </TabsContent>
            <TabsContent value="results" className="space-y-6">
              {gradebook && <PortalGradebookCard data={gradebook} />}
              {certificates.length > 0 && (
                <section data-testid="portal-certificates">
                  <h3 className="mb-2 text-sm font-medium">{t("results.certificates")}</h3>
                  <ul className="space-y-2">
                    {certificates.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {c.title}
                            {c.level ? ` · ${c.level}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("results.certificateMeta", {
                              number: c.number,
                              date: fmt(parseDateOnly(c.issuedAt), { dateStyle: "medium" }),
                            })}
                          </p>
                        </div>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {t("results.openCertificate")}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("results.certificateHint")}
                  </p>
                </section>
              )}
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
              <PortalScheduleTab
                token={token}
                weekly={page.schedule}
                endDate={portal.group.endDate}
                initial={schedule}
              />
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
