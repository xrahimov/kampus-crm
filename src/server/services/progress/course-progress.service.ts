import type { AttendanceStatus } from "@/generated/prisma/client";
import type { MembershipStatus } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/**
 * Progress per topic and per course for one student in one group (A-159,
 * online-lessons item C4). Everything is derived: the group's lessons and the
 * syllabus topics they covered, the student's attendance, homework submissions
 * and exercise attempts. Nothing is stored.
 */

/** What the student did with a topic's homework, across the lessons that covered it. */
export type TopicHomeworkState = "none" | "pending" | "submitted" | "accepted" | "returned";

export interface TopicProgressDto {
  topicId: string;
  sortOrder: number;
  title: string;
  /** The first lesson of the group that covered the topic; null while planned. */
  coveredOn: string | null;
  /** The student's mark at the covering lesson(s); PRESENT wins over others. */
  attendance: AttendanceStatus | null;
  homework: TopicHomeworkState;
  /** Exercises on the topic and on the homework of its lessons. */
  exercisesTotal: number;
  exercisesDone: number;
  /** Mean of the best score over the exercises done, in percent. */
  scorePercent: number | null;
  /**
   * The lesson has been held and the student did what it asked: every exercise
   * tried and the homework handed in (not returned). With neither, attending
   * is enough; an absence without catch-up work leaves the topic open.
   */
  complete: boolean;
}

export interface CourseProgressSummary {
  /** Complete topics over all topics, rounded; null when the course has no syllabus. */
  percent: number | null;
  topicsTotal: number;
  topicsCovered: number;
  topicsComplete: number;
  exercisesTotal: number;
  exercisesDone: number;
  scorePercent: number | null;
}

export interface CourseProgressDto extends CourseProgressSummary {
  membershipId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  /** Lessons held since the student joined, and how many they attended. */
  lessonsHeld: number;
  attended: number;
  attendancePercent: number | null;
  homeworkSet: number;
  homeworkDone: number;
  topics: TopicProgressDto[];
}

/** How one topic stands for one student in the group's progress table. */
export type TopicCell = "complete" | "open" | "absent" | "planned";

export interface GroupProgressRow {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
  percent: number | null;
  topicsComplete: number;
  topicsTotal: number;
  exercisesDone: number;
  exercisesTotal: number;
  scorePercent: number | null;
  attendancePercent: number | null;
  homeworkDone: number;
  homeworkSet: number;
  /** One cell per topic, in syllabus order. */
  cells: TopicCell[];
}

export interface GroupProgressDto {
  courseName: string;
  topics: Array<{ id: string; sortOrder: number; title: string; coveredOn: string | null }>;
  students: GroupProgressRow[];
}

const CURRENT: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE", "FROZEN"];
const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;
const mean = (values: number[]): number | null =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

type Member = { id: string; joinedAt: Date };

/**
 * The progress of several students of one group at once: the group's data is
 * read once and split per student. Lessons count up to today.
 */
export async function computeProgress(
  db: DbClient,
  groupId: string,
  members: Member[],
): Promise<Map<string, CourseProgressDto>> {
  const out = new Map<string, CourseProgressDto>();
  if (members.length === 0) return out;
  const memberIds = members.map((m) => m.id);
  const todayDate = isoToDate(today());
  const [group, topics, lessons] = await Promise.all([
    db.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true, courseId: true, course: { select: { name: true } } },
    }),
    db.courseTopic.findMany({
      where: { course: { groups: { some: { id: groupId } } } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, title: true, exercises: { select: { id: true } } },
    }),
    db.lesson.findMany({
      where: { groupId, date: { lte: todayDate } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        date: true,
        courseTopicId: true,
        attendances: {
          where: { membershipId: { in: memberIds } },
          select: { membershipId: true, status: true },
        },
        homework: {
          select: {
            id: true,
            exercises: { select: { id: true } },
            submissions: {
              where: { membershipId: { in: memberIds } },
              select: { membershipId: true, status: true },
            },
          },
        },
      },
    }),
  ]);
  const exerciseIds = [
    ...topics.flatMap((t) => t.exercises.map((e) => e.id)),
    ...lessons.flatMap((l) => l.homework?.exercises.map((e) => e.id) ?? []),
  ];
  const attempts = exerciseIds.length
    ? await db.exerciseAttempt.findMany({
        where: { membershipId: { in: memberIds }, exerciseId: { in: exerciseIds } },
        select: { membershipId: true, exerciseId: true, score: true, maxScore: true },
      })
    : [];
  /** Best percent per "membership:exercise". */
  const best = new Map<string, number>();
  for (const a of attempts) {
    const key = `${a.membershipId}:${a.exerciseId}`;
    const percent = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 100;
    if ((best.get(key) ?? -1) < percent) best.set(key, percent);
  }
  const lessonsByTopic = new Map<string, typeof lessons>();
  for (const l of lessons) {
    if (!l.courseTopicId) continue;
    const list = lessonsByTopic.get(l.courseTopicId) ?? [];
    list.push(l);
    lessonsByTopic.set(l.courseTopicId, list);
  }

  for (const m of members) {
    const bestOf = (exerciseId: string) => best.get(`${m.id}:${exerciseId}`);
    const scores: number[] = [];
    const rows: TopicProgressDto[] = topics.map((t) => {
      const own = lessonsByTopic.get(t.id) ?? [];
      const coveredOn = own[0] ? dateToIso(own[0].date) : null;
      let attendance: AttendanceStatus | null = null;
      let homework: TopicHomeworkState = "none";
      const exercises = t.exercises.map((e) => e.id);
      for (const lesson of own) {
        const mark = lesson.attendances.find((a) => a.membershipId === m.id)?.status;
        if (mark && mark !== "NOT_MARKED" && attendance !== "PRESENT") attendance = mark;
        if (lesson.homework) {
          exercises.push(...lesson.homework.exercises.map((e) => e.id));
          const sub = lesson.homework.submissions.find((s) => s.membershipId === m.id);
          const state: TopicHomeworkState = !sub
            ? "pending"
            : sub.status === "ACCEPTED"
              ? "accepted"
              : sub.status === "RETURNED"
                ? "returned"
                : "submitted";
          // The worst state across the topic's lessons is the one that counts.
          const rank: Record<TopicHomeworkState, number> = {
            none: 0,
            accepted: 1,
            submitted: 2,
            pending: 3,
            returned: 4,
          };
          if (rank[state] > rank[homework]) homework = state;
        }
      }
      const done = exercises.filter((id) => bestOf(id) !== undefined);
      const topicScores = done.map((id) => bestOf(id)!);
      scores.push(...topicScores);
      const workDone =
        done.length === exercises.length && homework !== "pending" && homework !== "returned";
      const nothingAsked = exercises.length === 0 && homework === "none";
      const complete =
        coveredOn !== null && workDone && !(nothingAsked && attendance === "ABSENT");
      return {
        topicId: t.id,
        sortOrder: t.sortOrder,
        title: t.title,
        coveredOn,
        attendance,
        homework,
        exercisesTotal: exercises.length,
        exercisesDone: done.length,
        scorePercent: mean(topicScores),
        complete,
      };
    });

    // Course-wide counts take every lesson since the student joined, topic or not.
    const since = lessons.filter((l) => l.date >= m.joinedAt);
    let attended = 0;
    let marked = 0;
    let homeworkSet = 0;
    let homeworkDone = 0;
    const seen = new Set(topics.flatMap((t) => t.exercises.map((e) => e.id)));
    for (const lesson of since) {
      const mark = lesson.attendances.find((a) => a.membershipId === m.id)?.status;
      if (mark && mark !== "NOT_MARKED") {
        marked += 1;
        if (mark === "PRESENT") attended += 1;
      }
      if (lesson.homework) {
        homeworkSet += 1;
        const sub = lesson.homework.submissions.find((s) => s.membershipId === m.id);
        if (sub && sub.status !== "RETURNED") homeworkDone += 1;
        for (const e of lesson.homework.exercises) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (!lesson.courseTopicId) {
            const b = bestOf(e.id);
            if (b !== undefined) scores.push(b);
          }
        }
      }
    }
    const exercisesTotal = seen.size;
    const exercisesDone = [...seen].filter((id) => bestOf(id) !== undefined).length;
    const topicsComplete = rows.filter((r) => r.complete).length;
    out.set(m.id, {
      membershipId: m.id,
      groupId,
      groupName: group.name,
      courseName: group.course.name,
      percent: pct(topicsComplete, rows.length),
      topicsTotal: rows.length,
      topicsCovered: rows.filter((r) => r.coveredOn !== null).length,
      topicsComplete,
      exercisesTotal,
      exercisesDone,
      scorePercent: mean(scores),
      lessonsHeld: since.length,
      attended,
      attendancePercent: pct(attended, marked),
      homeworkSet,
      homeworkDone,
      topics: rows,
    });
  }
  return out;
}

export const summaryOf = (p: CourseProgressDto): CourseProgressSummary => ({
  percent: p.percent,
  topicsTotal: p.topicsTotal,
  topicsCovered: p.topicsCovered,
  topicsComplete: p.topicsComplete,
  exercisesTotal: p.exercisesTotal,
  exercisesDone: p.exercisesDone,
  scorePercent: p.scorePercent,
});

/** The student's own progress through their group's course, by their personal link. */
export async function getPortalProgress(
  token: string,
  db: DbClient = prisma,
): Promise<CourseProgressDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const row = await db.groupMembership.findUniqueOrThrow({
    where: { id: membership.id },
    select: { joinedAt: true },
  });
  const map = await computeProgress(db, membership.groupId, [
    { id: membership.id, joinedAt: row.joinedAt },
  ]);
  return map.get(membership.id) ?? null;
}

/** The progress of each current student of the group, one cell per topic (teacher's table). */
export async function getGroupProgress(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupProgressDto> {
  authorize(actor, "groups.view");
  const group = await findGroupInScope(db, actor, groupId, {
    course: { select: { name: true } },
  });
  const members = await db.groupMembership.findMany({
    where: { groupId, status: { in: CURRENT }, student: { isArchived: false } },
    select: {
      id: true,
      joinedAt: true,
      status: true,
      student: { select: { id: true, fullName: true } },
    },
    orderBy: { student: { fullName: "asc" } },
  });
  const progress = await computeProgress(db, groupId, members);
  const first = progress.values().next().value;
  const topics =
    first?.topics.map((t) => ({
      id: t.topicId,
      sortOrder: t.sortOrder,
      title: t.title,
      coveredOn: t.coveredOn,
    })) ??
    (
      await db.courseTopic.findMany({
        where: { courseId: group.courseId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, title: true },
      })
    ).map((t) => ({ ...t, coveredOn: null }));
  return {
    courseName: group.course.name,
    topics,
    students: members.flatMap((m) => {
      const p = progress.get(m.id);
      if (!p) return [];
      return [
        {
          membershipId: m.id,
          studentId: m.student.id,
          fullName: m.student.fullName,
          status: m.status,
          percent: p.percent,
          topicsComplete: p.topicsComplete,
          topicsTotal: p.topicsTotal,
          exercisesDone: p.exercisesDone,
          exercisesTotal: p.exercisesTotal,
          scorePercent: p.scorePercent,
          attendancePercent: p.attendancePercent,
          homeworkDone: p.homeworkDone,
          homeworkSet: p.homeworkSet,
          cells: p.topics.map(cellOf),
        },
      ];
    }),
  };
}

export const cellOf = (t: TopicProgressDto): TopicCell =>
  t.coveredOn === null
    ? "planned"
    : t.complete
      ? "complete"
      : t.attendance === "ABSENT"
        ? "absent"
        : "open";

/** A student's progress in each current group, for the staff's student page. */
export async function listStudentCourseProgress(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<CourseProgressDto[]> {
  authorize(actor, "students.view");
  const student = await mustFind(
    db.student.findUnique({ where: { id: studentId }, select: { branchId: true } }),
    "errors.studentNotFound",
  );
  if (!actor.branchIds.includes(student.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const memberships = await db.groupMembership.findMany({
    where: { studentId, status: { in: CURRENT }, group: { status: { not: "ARCHIVED" } } },
    select: { id: true, groupId: true, joinedAt: true },
    orderBy: { joinedAt: "asc" },
  });
  const out: CourseProgressDto[] = [];
  for (const m of memberships) {
    const p = (await computeProgress(db, m.groupId, [m])).get(m.id);
    if (p) out.push(p);
  }
  return out;
}

/** The summary for one membership, or null when its course has no syllabus. */
export async function progressSummary(
  db: DbClient,
  membership: Member & { groupId: string },
): Promise<CourseProgressSummary | null> {
  const p = (await computeProgress(db, membership.groupId, [membership])).get(membership.id);
  return p && p.topicsTotal > 0 ? summaryOf(p) : null;
}
