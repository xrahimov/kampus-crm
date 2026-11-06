import type { MembershipStatus } from "@/lib/validation/groups";
import {
  DEFAULT_GRADE_WEIGHTS,
  GRADEBOOK_CATEGORIES,
  type GradebookCategory,
  type GradeWeights,
} from "@/lib/validation/settings";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { levelName } from "@/server/services/exams/exams.service";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import { parseRubric } from "@/server/services/homework/homework.service";
import { parseGradeWeights } from "@/server/services/settings/courses.service";
import { decimalToNumber, isoToDate } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/**
 * The gradebook (A-162, online-lessons item C8): every mark a student earns in
 * a group, in percent, in five categories, weighted into one final grade per
 * course and read against the group's grading scale. Nothing is stored except
 * the course's weights.
 */

export interface GradebookCategoryDto {
  key: GradebookCategory;
  weight: number;
  /** Mean of the category's items in percent; null without items. */
  percent: number | null;
  count: number;
}

export interface GradebookEntryDto {
  categories: GradebookCategoryDto[];
  /** Weighted over the categories that have items; null when none has. */
  final: number | null;
  /** The level of the grading scale the final grade falls into. */
  level: string | null;
}

export interface GradebookRowDto extends GradebookEntryDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
}

export interface GroupGradebookDto {
  courseId: string;
  courseName: string;
  weights: GradeWeights;
  scaleName: string | null;
  students: GradebookRowDto[];
}

export interface PortalGradebookDto extends GradebookEntryDto {
  courseName: string;
  weights: GradeWeights;
  scaleName: string | null;
}

const CURRENT: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE", "FROZEN"];
const mean = (values: number[]): number | null =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

type Member = { id: string; studentId: string; joinedAt: Date };

/** Every member's gradebook entry for one group, read in one pass. */
export async function computeGradebook(
  db: DbClient,
  groupId: string,
  members: Member[],
): Promise<{
  weights: GradeWeights;
  scaleName: string | null;
  entries: Map<string, GradebookEntryDto>;
}> {
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      gradingSystemId: true,
      gradingSystem: { select: { name: true } },
      course: {
        select: {
          id: true,
          gradeWeights: true,
          gradingSystemId: true,
          gradingSystem: { select: { name: true } },
        },
      },
    },
  });
  const weights = parseGradeWeights(group.course.gradeWeights) ?? DEFAULT_GRADE_WEIGHTS;
  const systemId = group.gradingSystemId ?? group.course.gradingSystemId;
  const scaleName = group.gradingSystem?.name ?? group.course.gradingSystem?.name ?? null;
  const entries = new Map<string, GradebookEntryDto>();
  if (members.length === 0) return { weights, scaleName, entries };
  const memberIds = members.map((m) => m.id);
  const studentIds = members.map((m) => m.studentId);
  const todayDate = isoToDate(today());

  const [levels, grades, homework, topicExercises, attempts, examResults, tests] =
    await Promise.all([
      systemId
        ? db.gradingLevel.findMany({
            where: { gradingSystemId: systemId },
            orderBy: { sortOrder: "asc" },
          })
        : Promise.resolve([]),
      db.grade.findMany({
        where: { membershipId: { in: memberIds } },
        select: { membershipId: true, score: true },
      }),
      db.homework.findMany({
        where: { groupId },
        select: {
          id: true,
          dueDate: true,
          createdAt: true,
          rubric: true,
          lesson: { select: { date: true } },
          exercises: { select: { id: true } },
          submissions: {
            where: { membershipId: { in: memberIds } },
            select: { membershipId: true, status: true, score: true },
          },
        },
      }),
      db.exercise.findMany({
        where: { topic: { courseId: group.course.id } },
        select: { id: true },
      }),
      db.exerciseAttempt.findMany({
        where: { membershipId: { in: memberIds } },
        select: { membershipId: true, exerciseId: true, score: true, maxScore: true },
      }),
      db.examResult.findMany({
        where: {
          studentId: { in: studentIds },
          isPresent: true,
          score: { not: null },
          exam: { groupId },
        },
        select: { studentId: true, score: true, exam: { select: { maxScore: true } } },
      }),
      db.testAttempt.findMany({
        where: { studentId: { in: studentIds }, groupId },
        select: { studentId: true, testId: true, percent: true },
      }),
    ]);

  // Lesson marks are in the scale's units; its top level says what 100 % is.
  const scaleMax = levels.length
    ? Math.max(...levels.map((l) => decimalToNumber(l.maxScore)))
    : Math.max(100, ...grades.map((g) => decimalToNumber(g.score)));
  const exerciseIds = new Set([
    ...topicExercises.map((e) => e.id),
    ...homework.flatMap((h) => h.exercises.map((e) => e.id)),
  ]);

  for (const m of members) {
    const lessons = grades
      .filter((g) => g.membershipId === m.id)
      .map((g) => clamp((decimalToNumber(g.score) / scaleMax) * 100));

    const hw: number[] = [];
    for (const h of homework) {
      const when = h.lesson?.date ?? h.dueDate ?? h.createdAt;
      if (when < m.joinedAt) continue;
      const sub = h.submissions.find((s) => s.membershipId === m.id);
      const rubricMax = parseRubric(h.rubric).reduce((sum, c) => sum + c.max, 0);
      if (sub?.status === "ACCEPTED") {
        hw.push(rubricMax > 0 && sub.score !== null ? clamp((sub.score / rubricMax) * 100) : 100);
      } else if (sub?.status === "RETURNED") {
        hw.push(0);
      } else if (!sub && when < todayDate) {
        // Not handed in once the lesson or the due date has passed.
        hw.push(0);
      }
    }

    const best = new Map<string, number>();
    for (const a of attempts) {
      if (a.membershipId !== m.id || !exerciseIds.has(a.exerciseId)) continue;
      const percent = a.maxScore > 0 ? clamp((a.score / a.maxScore) * 100) : 100;
      if ((best.get(a.exerciseId) ?? -1) < percent) best.set(a.exerciseId, percent);
    }

    const bestTest = new Map<string, number>();
    for (const t of tests) {
      if (t.studentId !== m.studentId) continue;
      const percent = clamp(decimalToNumber(t.percent));
      if ((bestTest.get(t.testId) ?? -1) < percent) bestTest.set(t.testId, percent);
    }

    const exams = examResults
      .filter((r) => r.studentId === m.studentId)
      .map((r) => {
        const max = decimalToNumber(r.exam.maxScore);
        return max > 0 ? clamp((decimalToNumber(r.score!) / max) * 100) : 100;
      });

    const items: Record<GradebookCategory, number[]> = {
      lessons,
      homework: hw,
      exercises: [...best.values()],
      tests: [...bestTest.values()],
      exams,
    };
    const categories = GRADEBOOK_CATEGORIES.map((key) => ({
      key,
      weight: weights[key],
      percent: mean(items[key]),
      count: items[key].length,
    }));
    const counted = categories.filter((c) => c.percent !== null && c.weight > 0);
    const totalWeight = counted.reduce((sum, c) => sum + c.weight, 0);
    const final =
      totalWeight > 0
        ? Math.round(counted.reduce((sum, c) => sum + c.percent! * c.weight, 0) / totalWeight)
        : null;
    entries.set(m.id, {
      categories,
      final,
      level: final === null ? null : levelName(levels, (final / 100) * scaleMax),
    });
  }
  return { weights, scaleName, entries };
}

/** The gradebook of a group's current students (the Gradebook tab). */
export async function getGroupGradebook(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupGradebookDto> {
  authorize(actor, "groups.view");
  const group = await findGroupInScope(db, actor, groupId, {
    course: { select: { id: true, name: true } },
  });
  const members = await db.groupMembership.findMany({
    where: { groupId, status: { in: CURRENT }, student: { isArchived: false } },
    select: {
      id: true,
      studentId: true,
      joinedAt: true,
      status: true,
      student: { select: { fullName: true } },
    },
    orderBy: { student: { fullName: "asc" } },
  });
  const { weights, scaleName, entries } = await computeGradebook(db, groupId, members);
  return {
    courseId: group.course.id,
    courseName: group.course.name,
    weights,
    scaleName,
    students: members.flatMap((m) => {
      const entry = entries.get(m.id);
      return entry
        ? [
            {
              membershipId: m.id,
              studentId: m.studentId,
              fullName: m.student.fullName,
              status: m.status,
              ...entry,
            },
          ]
        : [];
    }),
  };
}

/** The student's own gradebook through their personal link. */
export async function getPortalGradebook(
  token: string,
  db: DbClient = prisma,
): Promise<PortalGradebookDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const row = await db.groupMembership.findUniqueOrThrow({
    where: { id: membership.id },
    select: {
      joinedAt: true,
      studentId: true,
      group: { select: { course: { select: { name: true } } } },
    },
  });
  const { weights, scaleName, entries } = await computeGradebook(db, membership.groupId, [
    { id: membership.id, studentId: row.studentId, joinedAt: row.joinedAt },
  ]);
  const entry = entries.get(membership.id);
  if (!entry) return null;
  return { courseName: row.group.course.name, weights, scaleName, ...entry };
}
