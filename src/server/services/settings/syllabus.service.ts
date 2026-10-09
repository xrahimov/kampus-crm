import type { CourseSyllabusInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";

import { dateToIso, mustFind } from "./shared";

/*
 * Course syllabus (round 2 B9, A-137): the course carries its topics in
 * teaching order; a group's lessons take the next uncovered topic when
 * attendance is first marked, so teachers see what to teach and managers how
 * far each group has come.
 */

export interface CourseTopicDto {
  id: string;
  sortOrder: number;
  title: string;
  note: string | null;
}

export interface GroupSyllabusTopicDto extends CourseTopicDto {
  status: "done" | "next" | "planned";
  /** The lesson that covered it, when one did. */
  lessonId: string | null;
  lessonDate: string | null;
}

export interface GroupSyllabusDto {
  courseId: string;
  courseName: string;
  total: number;
  done: number;
  next: CourseTopicDto | null;
  topics: GroupSyllabusTopicDto[];
}

const toDto = (t: { id: string; sortOrder: number; title: string; note: string | null }) => ({
  id: t.id,
  sortOrder: t.sortOrder,
  title: t.title,
  note: t.note,
});

async function courseInScope(db: DbClient, actor: Actor, courseId: string) {
  const course = await mustFind(
    db.course.findUnique({ where: { id: courseId }, select: { id: true, branchId: true } }),
  );
  authorizeBranch(actor, course.branchId);
  return course;
}

export async function getCourseSyllabus(
  actor: Actor,
  courseId: string,
  db: DbClient = prisma,
): Promise<CourseTopicDto[]> {
  authorize(actor, "settings.catalog");
  await courseInScope(db, actor, courseId);
  const rows = await db.courseTopic.findMany({
    where: { courseId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(toDto);
}

/**
 * Replaces the course's topic list with the given one, in order. A title that
 * already exists keeps its row, so lessons that covered it stay linked;
 * a title that disappears takes its row (and the lessons' link) with it.
 */
export async function setCourseSyllabus(
  actor: Actor,
  courseId: string,
  input: CourseSyllabusInput,
  db: DbClient = prisma,
): Promise<CourseTopicDto[]> {
  authorize(actor, "settings.catalog");
  const course = await courseInScope(db, actor, courseId);
  return db.$transaction(async (tx) => {
    const existing = await tx.courseTopic.findMany({
      where: { courseId },
      orderBy: { sortOrder: "asc" },
    });
    const spare = new Map<string, typeof existing>();
    for (const row of existing) {
      const list = spare.get(row.title) ?? [];
      list.push(row);
      spare.set(row.title, list);
    }
    const kept = new Set<string>();
    let order = 0;
    for (const topic of input.topics) {
      order += 1;
      const note = topic.note ?? null;
      const reuse = spare.get(topic.title)?.shift();
      if (reuse) {
        kept.add(reuse.id);
        if (reuse.sortOrder !== order || reuse.note !== note) {
          await tx.courseTopic.update({
            where: { id: reuse.id },
            data: { sortOrder: order, note },
          });
        }
      } else {
        const row = await tx.courseTopic.create({
          data: { courseId, sortOrder: order, title: topic.title, note },
        });
        kept.add(row.id);
      }
    }
    const gone = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
    if (gone.length > 0) await tx.courseTopic.deleteMany({ where: { id: { in: gone } } });
    await recordAudit(tx, actor, {
      action: "course.syllabus",
      entity: "Course",
      entityId: courseId,
      before: { topics: existing.map((t) => t.title) },
      after: { topics: input.topics.map((t) => t.title) },
      branchId: course.branchId,
    });
    const rows = await tx.courseTopic.findMany({
      where: { courseId },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toDto);
  });
}

/** The first topic of the course no lesson of the group has covered yet. */
export async function nextTopicForGroup(
  db: DbClient,
  group: { id: string; courseId: string },
): Promise<CourseTopicDto | null> {
  const [topics, covered] = await Promise.all([
    db.courseTopic.findMany({ where: { courseId: group.courseId }, orderBy: { sortOrder: "asc" } }),
    db.lesson.findMany({
      where: { groupId: group.id, courseTopicId: { not: null } },
      select: { courseTopicId: true },
    }),
  ]);
  const used = new Set(covered.map((l) => l.courseTopicId));
  const next = topics.find((t) => !used.has(t.id));
  return next ? toDto(next) : null;
}

/**
 * Gives a lesson without a topic the group's next syllabus topic. Called when
 * attendance is first marked, inside that transaction; a no-op when the lesson
 * already has a topic of either kind or the course has no syllabus.
 */
export async function assignNextTopic(
  tx: DbClient,
  lesson: { id: string; groupId: string; topic: string | null; courseTopicId: string | null },
): Promise<CourseTopicDto | null> {
  if (lesson.topic || lesson.courseTopicId) return null;
  const group = await tx.group.findUniqueOrThrow({
    where: { id: lesson.groupId },
    select: { id: true, courseId: true },
  });
  const next = await nextTopicForGroup(tx, group);
  if (!next) return null;
  await tx.lesson.update({ where: { id: lesson.id }, data: { courseTopicId: next.id } });
  return next;
}

/** The Syllabus tab of a group: every topic with the lesson that covered it. */
export async function getGroupSyllabus(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupSyllabusDto> {
  authorize(actor, "groups.view");
  const group = await findGroupInScope(db, actor, groupId, {
    course: { select: { id: true, name: true } },
  });
  const [topics, lessons] = await Promise.all([
    db.courseTopic.findMany({ where: { courseId: group.courseId }, orderBy: { sortOrder: "asc" } }),
    db.lesson.findMany({
      where: { groupId, courseTopicId: { not: null } },
      select: { id: true, date: true, courseTopicId: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);
  const byTopic = new Map<string, { id: string; date: Date }>();
  for (const l of lessons) {
    if (l.courseTopicId && !byTopic.has(l.courseTopicId)) byTopic.set(l.courseTopicId, l);
  }
  let nextSeen = false;
  const rows: GroupSyllabusTopicDto[] = topics.map((t) => {
    const lesson = byTopic.get(t.id);
    let status: GroupSyllabusTopicDto["status"] = "planned";
    if (lesson) status = "done";
    else if (!nextSeen) {
      status = "next";
      nextSeen = true;
    }
    return {
      ...toDto(t),
      status,
      lessonId: lesson?.id ?? null,
      lessonDate: lesson ? dateToIso(lesson.date) : null,
    };
  });
  const next = rows.find((r) => r.status === "next");
  return {
    courseId: group.courseId,
    courseName: group.course.name,
    total: rows.length,
    done: rows.filter((r) => r.status === "done").length,
    next: next ? toDto(next) : null,
    topics: rows,
  };
}
