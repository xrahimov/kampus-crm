import type { Prisma, TopicBlockKind } from "@/generated/prisma/client";
import type { TopicContentInput, TopicReleaseInput } from "@/lib/validation/topic-content";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope, today } from "@/server/services/groups/shared";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";
import { getStorage } from "@/server/storage/local";

/*
 * Lesson content per syllabus topic (A-157, online-lessons item C1). A topic
 * of the course carries blocks (text, video, file, link) written once for
 * every group of the course. A group's students open a topic once a lesson of
 * the group has covered it, unless the teacher opens it earlier (now or from a
 * date). Managers with the catalogue right and teachers of a group of the
 * course may write the content; opening is the attendance right of the group.
 */

export interface TopicBlockDto {
  id: string;
  sortOrder: number;
  kind: TopicBlockKind;
  title: string;
  body: string | null;
  url: string | null;
  size: number | null;
}

export interface TopicContentDto {
  topicId: string;
  title: string;
  courseId: string;
  courseName: string;
  blocks: TopicBlockDto[];
  canEdit: boolean;
}

export type TopicReleaseMode = "lesson" | "now" | "date";

export interface TopicReleaseDto {
  mode: TopicReleaseMode;
  /** The day it opens when the mode is `date`. */
  date: string | null;
}

/** One topic of the course on a student's page. */
export interface PortalTopicDto {
  id: string;
  sortOrder: number;
  title: string;
  note: string | null;
  open: boolean;
  /** Blocks of an open topic, with the student's own file URLs; empty while locked. */
  blocks: TopicBlockDto[];
  /** The lesson that covered it, when one did. */
  coveredOn: string | null;
  /** The day a locked topic opens, when the teacher set one. */
  opensOn: string | null;
}

export interface PortalCourseDto {
  courseName: string;
  total: number;
  open: number;
  topics: PortalTopicDto[];
}

const toDto = (b: {
  id: string;
  sortOrder: number;
  kind: TopicBlockKind;
  title: string;
  body: string | null;
  url: string | null;
  size: number | null;
}): TopicBlockDto => ({
  id: b.id,
  sortOrder: b.sortOrder,
  kind: b.kind,
  title: b.title,
  body: b.body,
  url: b.url,
  size: b.size,
});

const topicSelect = {
  id: true,
  title: true,
  course: { select: { id: true, name: true, branchId: true } },
} satisfies Prisma.CourseTopicSelect;

async function topicInScope(db: DbClient, actor: Actor, topicId: string) {
  const topic = await mustFind(
    db.courseTopic.findUnique({ where: { id: topicId }, select: topicSelect }),
  );
  if (!actor.branchIds.includes(topic.course.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  return topic;
}

/** The catalogue right, or teaching a group of the course and holding the attendance right. */
export async function canEditTopicContent(
  db: DbClient,
  actor: Actor,
  courseId: string,
): Promise<boolean> {
  if (can(actor, "settings.catalog")) return true;
  if (!can(actor, "groups.attendance.mark")) return false;
  return (await db.group.count({ where: { ...groupScope(actor), courseId } })) > 0;
}

export async function getTopicContent(
  actor: Actor,
  topicId: string,
  db: DbClient = prisma,
): Promise<TopicContentDto> {
  authorize(actor, "groups.view");
  const topic = await topicInScope(db, actor, topicId);
  const [blocks, canEdit] = await Promise.all([
    db.courseTopicBlock.findMany({ where: { topicId }, orderBy: { sortOrder: "asc" } }),
    canEditTopicContent(db, actor, topic.course.id),
  ]);
  return {
    topicId: topic.id,
    title: topic.title,
    courseId: topic.course.id,
    courseName: topic.course.name,
    blocks: blocks.map(toDto),
    canEdit,
  };
}

/** Replaces the topic's blocks with the given ones, in order; files no block names any more are removed. */
export async function setTopicContent(
  actor: Actor,
  topicId: string,
  input: TopicContentInput,
  db: DbClient = prisma,
): Promise<TopicContentDto> {
  authorize(actor, "groups.view");
  const topic = await topicInScope(db, actor, topicId);
  if (!(await canEditTopicContent(db, actor, topic.course.id))) throw AppError.forbidden();
  const before = await db.courseTopicBlock.findMany({ where: { topicId } });
  const kept = new Set(input.blocks.map((b) => b.url).filter(Boolean));
  const orphaned = before
    .map((b) => b.url)
    .filter((url): url is string => Boolean(url) && url!.startsWith("/api/v1/files/"))
    .filter((url) => !kept.has(url));
  const result = await db.$transaction(async (tx) => {
    await tx.courseTopicBlock.deleteMany({ where: { topicId } });
    if (input.blocks.length > 0) {
      await tx.courseTopicBlock.createMany({
        data: input.blocks.map((b, i) => ({
          topicId,
          sortOrder: i + 1,
          kind: b.kind,
          title: b.title,
          body: b.kind === "TEXT" ? (b.body ?? null) : null,
          url: b.kind === "TEXT" ? null : (b.url ?? null),
          size: b.size ?? null,
        })),
      });
    }
    await recordAudit(tx, actor, {
      action: "topic.content",
      entity: "CourseTopic",
      entityId: topicId,
      before: { blocks: before.length },
      after: { blocks: input.blocks.length, titles: input.blocks.map((b) => b.title) },
      branchId: topic.course.branchId,
    });
    return tx.courseTopicBlock.findMany({ where: { topicId }, orderBy: { sortOrder: "asc" } });
  });
  // Other topics never share an upload, so a dropped file can go.
  const storage = getStorage();
  for (const url of orphaned) {
    const used = await db.courseTopicBlock.count({ where: { url } });
    if (used === 0) await storage.delete(url.slice("/api/v1/files/".length)).catch(() => undefined);
  }
  return {
    topicId: topic.id,
    title: topic.title,
    courseId: topic.course.id,
    courseName: topic.course.name,
    blocks: result.map(toDto),
    canEdit: true,
  };
}

/** Sets when the group's students get the topic: after the lesson (default), now, or from a date. */
export async function setTopicRelease(
  actor: Actor,
  groupId: string,
  topicId: string,
  input: TopicReleaseInput,
  db: DbClient = prisma,
): Promise<TopicReleaseDto> {
  authorize(actor, "groups.attendance.mark");
  const group = await findGroupInScope(db, actor, groupId, {});
  const topic = await db.courseTopic.findFirst({
    where: { id: topicId, courseId: group.courseId },
    select: { id: true, title: true },
  });
  if (!topic) throw AppError.validation({ topicId: ["validation.required"] });
  return db.$transaction(async (tx) => {
    const existing = await tx.groupTopicRelease.findUnique({
      where: { groupId_topicId: { groupId, topicId } },
    });
    let release: TopicReleaseDto;
    if (input.mode === "lesson") {
      if (existing) await tx.groupTopicRelease.delete({ where: { id: existing.id } });
      release = { mode: "lesson", date: null };
    } else {
      const openFrom = input.mode === "date" ? isoToDate(input.date!) : null;
      await tx.groupTopicRelease.upsert({
        where: { groupId_topicId: { groupId, topicId } },
        create: { groupId, topicId, openFrom },
        update: { openFrom },
      });
      release = { mode: input.mode, date: input.mode === "date" ? input.date! : null };
    }
    await recordAudit(tx, actor, {
      action: "topic.release",
      entity: "Group",
      entityId: groupId,
      before: existing
        ? { topic: topic.title, openFrom: existing.openFrom ? dateToIso(existing.openFrom) : "now" }
        : null,
      after: { topic: topic.title, ...release },
      branchId: group.branchId,
    });
    return release;
  });
}

export function releaseOf(row: { openFrom: Date | null } | null | undefined): TopicReleaseDto {
  if (!row) return { mode: "lesson", date: null };
  return row.openFrom
    ? { mode: "date", date: dateToIso(row.openFrom) }
    : { mode: "now", date: null };
}

/** Open today: a lesson of the group covered it, or the teacher opened it (now or by a past date). */
export function topicOpen(
  release: TopicReleaseDto,
  coveredOn: string | null,
  todayIso: string = today(),
): boolean {
  if (coveredOn && coveredOn <= todayIso) return true;
  if (release.mode === "now") return true;
  if (release.mode === "date" && release.date && release.date <= todayIso) return true;
  return false;
}

/** The course's topics as the student whose link this is sees them. */
export async function listPortalCourse(
  token: string,
  db: DbClient = prisma,
): Promise<PortalCourseDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const group = await db.group.findUniqueOrThrow({
    where: { id: membership.groupId },
    select: { courseId: true, course: { select: { name: true } } },
  });
  const [topics, lessons, releases] = await Promise.all([
    db.courseTopic.findMany({
      where: { courseId: group.courseId },
      orderBy: { sortOrder: "asc" },
      include: { blocks: { orderBy: { sortOrder: "asc" } } },
    }),
    db.lesson.findMany({
      where: { groupId: membership.groupId, courseTopicId: { not: null } },
      select: { date: true, courseTopicId: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.groupTopicRelease.findMany({ where: { groupId: membership.groupId } }),
  ]);
  const covered = new Map<string, string>();
  for (const l of lessons) {
    if (l.courseTopicId && !covered.has(l.courseTopicId)) {
      covered.set(l.courseTopicId, dateToIso(l.date));
    }
  }
  const releaseByTopic = new Map(releases.map((r) => [r.topicId, releaseOf(r)]));
  const now = today();
  const rows: PortalTopicDto[] = topics.map((t) => {
    const release = releaseByTopic.get(t.id) ?? releaseOf(null);
    const coveredOn = covered.get(t.id) ?? null;
    const open = topicOpen(release, coveredOn, now);
    return {
      id: t.id,
      sortOrder: t.sortOrder,
      title: t.title,
      note: t.note,
      open,
      blocks: open
        ? t.blocks.map((b) => ({
            ...toDto(b),
            url:
              b.url && b.url.startsWith("/api/v1/files/")
                ? `/api/v1/public/class/${encodeURIComponent(token)}/files/${b.url.slice("/api/v1/files/".length)}`
                : b.url,
          }))
        : [],
      coveredOn,
      opensOn: !open && release.mode === "date" ? release.date : null,
    };
  });
  return {
    courseName: group.course.name,
    total: rows.length,
    open: rows.filter((r) => r.open).length,
    topics: rows,
  };
}

/** Whether the student behind the link may fetch a topic file: the block exists and its topic is open to them. */
export async function portalTopicFileAllowed(
  db: DbClient,
  membership: { id: string; groupId: string },
  url: string,
): Promise<boolean> {
  const blocks = await db.courseTopicBlock.findMany({
    where: { url, topic: { course: { groups: { some: { id: membership.groupId } } } } },
    select: { topicId: true },
  });
  if (blocks.length === 0) return false;
  const topicIds = [...new Set(blocks.map((b) => b.topicId))];
  const [lesson, releases] = await Promise.all([
    db.lesson.findFirst({
      where: { groupId: membership.groupId, courseTopicId: { in: topicIds } },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
    db.groupTopicRelease.findMany({
      where: { groupId: membership.groupId, topicId: { in: topicIds } },
    }),
  ]);
  const now = today();
  if (lesson && dateToIso(lesson.date) <= now) return true;
  return releases.some((r) => topicOpen(releaseOf(r), null, now));
}
