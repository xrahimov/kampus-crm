import type { AttendanceStatus, ExamType } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";
import { levelName } from "@/server/services/exams/exams.service";
import { today } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * The student portal behind a membership's personal link (/class/<token>).
 * Students have no accounts, so the link is the whole credential: everything
 * here is read-only and limited to that one membership (its group's lessons,
 * the student's own marks, money and results). Nothing about other students
 * is exposed.
 */

/** How many past lessons the portal lists. */
const LESSON_LIMIT = 40;

export interface PortalLessonDto {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  attendance: AttendanceStatus | null;
  grade: number | null;
  gradeComment: string | null;
}

export interface PortalDto {
  student: { fullName: string; coins: number };
  group: { name: string; courseName: string; teachers: string[]; endDate: string };
  /** The next scheduled lesson from today on, if the group still has one. */
  nextLesson: Omit<PortalLessonDto, "attendance" | "grade" | "gradeComment"> | null;
  /** Past lessons, newest first. */
  lessons: PortalLessonDto[];
  stats: {
    lessonsHeld: number;
    attendancePercent: number | null;
    gradeAverage: number | null;
  };
  money: {
    monthlyPrice: number;
    balance: number;
    nextPaymentDate: string | null;
    payments: Array<{
      id: string;
      paidAt: string;
      amount: number;
      effectiveMonth: string;
      method: string | null;
    }>;
  };
  exams: Array<{
    id: string;
    name: string;
    type: ExamType;
    date: string;
    score: number | null;
    maxScore: number;
    passScore: number;
    passed: boolean | null;
    level: string | null;
    isPresent: boolean;
  }>;
  tests: Array<{
    id: string;
    testName: string;
    subject: string;
    score: number;
    maxScore: number;
    percent: number;
    submittedAt: string;
  }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Everything a student's personal link shows besides the video call itself. */
export async function getPortal(token: string, db: DbClient = prisma): Promise<PortalDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const todayIso = today();

  const [group, lessons, nextLesson, attendance, grades, payments, examResults, attempts, coins] =
    await Promise.all([
      db.group.findUniqueOrThrow({
        where: { id: membership.groupId },
        select: {
          endDate: true,
          course: { select: { name: true } },
          teachers: { select: { user: { select: { fullName: true } } } },
        },
      }),
      db.lesson.findMany({
        where: { groupId: membership.groupId, date: { lte: isoToDate(todayIso) } },
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
        take: LESSON_LIMIT,
        select: { id: true, date: true, startTime: true, endTime: true, topic: true },
      }),
      db.lesson.findFirst({
        where: { groupId: membership.groupId, date: { gte: isoToDate(todayIso) } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: { id: true, date: true, startTime: true, endTime: true, topic: true },
      }),
      db.attendance.findMany({
        where: { membershipId: membership.id },
        select: { lessonId: true, status: true },
      }),
      db.grade.findMany({
        where: { membershipId: membership.id },
        select: { lessonId: true, score: true, comment: true },
      }),
      db.payment.findMany({
        where: { membershipId: membership.id },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 24,
        select: {
          id: true,
          paidAt: true,
          amount: true,
          effectiveMonth: true,
          paymentMethod: { select: { name: true } },
        },
      }),
      db.examResult.findMany({
        where: { studentId: membership.studentId },
        include: {
          exam: {
            select: {
              id: true,
              name: true,
              type: true,
              date: true,
              maxScore: true,
              passScore: true,
              gradingSystemId: true,
              groupId: true,
            },
          },
        },
        orderBy: { exam: { date: "desc" } },
      }),
      db.testAttempt.findMany({
        where: { studentId: membership.studentId },
        orderBy: { submittedAt: "desc" },
        take: 30,
        select: {
          id: true,
          score: true,
          maxScore: true,
          percent: true,
          submittedAt: true,
          test: { select: { name: true, subject: true } },
        },
      }),
      db.coinTransaction.aggregate({
        where: { studentId: membership.studentId },
        _sum: { amount: true },
      }),
    ]);

  const attendanceByLesson = new Map(attendance.map((a) => [a.lessonId, a.status]));
  const gradeByLesson = new Map(grades.map((g) => [g.lessonId, g]));
  const lessonDtos: PortalLessonDto[] = lessons.map((l) => {
    const grade = gradeByLesson.get(l.id);
    return {
      id: l.id,
      date: dateToIso(l.date),
      startTime: l.startTime,
      endTime: l.endTime,
      topic: l.topic,
      attendance: attendanceByLesson.get(l.id) ?? null,
      grade: grade ? decimalToNumber(grade.score) : null,
      gradeComment: grade?.comment ?? null,
    };
  });

  // Attendance and grades across the whole membership, not only the listed lessons.
  const marked = attendance.filter((a) => a.status === "PRESENT" || a.status === "ABSENT");
  const present = marked.filter((a) => a.status === "PRESENT").length;
  const scores = grades.map((g) => decimalToNumber(g.score));

  const balance = (await membershipBalances(db, [membership.id])).get(membership.id);

  // Exam levels come from the grading scale of the exam, its group or the course.
  const levelCache = new Map<string, Awaited<ReturnType<typeof levelsOf>>>();
  const exams: PortalDto["exams"] = [];
  for (const r of examResults) {
    let levels = levelCache.get(r.examId);
    if (!levels) levelCache.set(r.examId, (levels = await levelsOf(db, r.exam)));
    const score = r.score ? decimalToNumber(r.score) : null;
    const passScore = decimalToNumber(r.exam.passScore);
    exams.push({
      id: r.examId,
      name: r.exam.name,
      type: r.exam.type,
      date: dateToIso(r.exam.date),
      score,
      maxScore: decimalToNumber(r.exam.maxScore),
      passScore,
      passed: score === null ? null : score >= passScore,
      level: levelName(levels, score),
      isPresent: r.isPresent,
    });
  }

  return {
    student: { fullName: membership.student.fullName, coins: coins._sum.amount ?? 0 },
    group: {
      name: membership.group.name,
      courseName: group.course.name,
      teachers: group.teachers.map((t) => t.user.fullName),
      endDate: dateToIso(group.endDate),
    },
    nextLesson: nextLesson
      ? {
          id: nextLesson.id,
          date: dateToIso(nextLesson.date),
          startTime: nextLesson.startTime,
          endTime: nextLesson.endTime,
          topic: nextLesson.topic,
        }
      : null,
    lessons: lessonDtos,
    stats: {
      lessonsHeld: marked.length,
      attendancePercent: marked.length ? round1((present / marked.length) * 100) : null,
      gradeAverage: scores.length
        ? round1(scores.reduce((s, x) => s + x, 0) / scores.length)
        : null,
    },
    money: {
      monthlyPrice: balance?.monthlyPrice ?? 0,
      balance: balance?.balance ?? 0,
      nextPaymentDate: balance?.nextPaymentDate ?? null,
      payments: payments.map((p) => ({
        id: p.id,
        paidAt: dateToIso(p.paidAt),
        amount: decimalToNumber(p.amount),
        effectiveMonth: dateToIso(p.effectiveMonth),
        method: p.paymentMethod?.name ?? null,
      })),
    },
    exams,
    tests: attempts.map((a) => ({
      id: a.id,
      testName: a.test.name,
      subject: a.test.subject,
      score: a.score,
      maxScore: a.maxScore,
      percent: decimalToNumber(a.percent),
      submittedAt: a.submittedAt.toISOString(),
    })),
  };
}

/** The grading scale an exam is read against: its own, else the group's, else the course's. */
async function levelsOf(
  db: DbClient,
  exam: { gradingSystemId: string | null; groupId: string | null },
) {
  let systemId = exam.gradingSystemId;
  if (!systemId && exam.groupId) {
    const group = await db.group.findUnique({
      where: { id: exam.groupId },
      select: { gradingSystemId: true, course: { select: { gradingSystemId: true } } },
    });
    systemId = group?.gradingSystemId ?? group?.course.gradingSystemId ?? null;
  }
  if (!systemId) return [];
  return db.gradingLevel.findMany({
    where: { gradingSystemId: systemId },
    orderBy: { sortOrder: "asc" },
  });
}
