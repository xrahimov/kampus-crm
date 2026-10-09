import type { HomeworkStatus, Prisma } from "@/generated/prisma/client";
import type {
  HomeworkInput,
  HomeworkReviewInput,
  HomeworkSubmissionInput,
} from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { findGroupInScope, ownGroupsOnly, today } from "@/server/services/groups/shared";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { notifyHomework } from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";
import { STORAGE_KEY_PATTERN } from "@/server/storage/storage";

/*
 * Homework (A-102). A lesson carries at most one homework: text, an optional
 * link, an optional file and an optional due date. Students answer through
 * their personal link (a note and/or a file); the teacher accepts or returns
 * the answer. Accepting awards the "Uy vazifasi" coin rule once (A-79).
 *
 * Rights reuse the attendance ones: setting and checking homework is the same
 * right as marking the lesson's attendance (groups.attendance.mark, in the
 * group's scope); reading it needs groups.view.
 */

/** Lessons offered for a new homework: this many days ahead of today at most. */
const ASSIGNABLE_DAYS_AHEAD = 14;
/** Upload limit for homework files, teacher's and student's alike. */
export const HOMEWORK_FILE_MAX_BYTES = 20 * 1024 * 1024;

export interface HomeworkSubmissionDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: HomeworkStatus | null;
  note: string | null;
  attachmentUrl: string | null;
  submittedAt: string | null;
  teacherComment: string | null;
  teacherAudioUrl: string | null;
  checkedByName: string | null;
}

export interface HomeworkDto {
  id: string;
  lessonId: string;
  lessonDate: string;
  lessonTopic: string | null;
  text: string;
  linkUrl: string | null;
  attachmentUrl: string | null;
  dueDate: string | null;
  /** A speaking task: answered with a recording (A-141). */
  speaking: boolean;
  createdByName: string | null;
  createdAt: string;
  /** One row per current member of the group. */
  submissions: HomeworkSubmissionDto[];
}

export interface GroupHomeworkDto {
  items: HomeworkDto[];
  /** Lessons a homework can be set for: past ones and the next two weeks, newest first. */
  lessons: Array<{ id: string; date: string; topic: string | null; hasHomework: boolean }>;
}

/** What one student sees of a homework through their link. */
export interface PortalHomeworkDto {
  id: string;
  lessonDate: string;
  lessonTopic: string | null;
  text: string;
  linkUrl: string | null;
  attachmentUrl: string | null;
  dueDate: string | null;
  speaking: boolean;
  submission: {
    status: HomeworkStatus;
    note: string | null;
    attachmentUrl: string | null;
    submittedAt: string;
    teacherComment: string | null;
    teacherAudioUrl: string | null;
  } | null;
}

const include = {
  lesson: { select: { date: true, topic: true } },
  group: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  submissions: { include: { checkedBy: { select: { fullName: true } } } },
} satisfies Prisma.HomeworkInclude;
type Row = Prisma.HomeworkGetPayload<{ include: typeof include }>;

const MEMBER_STATUSES = ["NEW", "TRIAL", "ACTIVE", "FROZEN"] as const;

function toDto(
  row: Row,
  members: Array<{ id: string; studentId: string; student: { fullName: string } }>,
): HomeworkDto {
  const byMembership = new Map(row.submissions.map((s) => [s.membershipId, s]));
  return {
    id: row.id,
    lessonId: row.lessonId,
    lessonDate: dateToIso(row.lesson.date),
    lessonTopic: row.lesson.topic,
    text: row.text,
    linkUrl: row.linkUrl,
    attachmentUrl: row.attachmentUrl,
    dueDate: row.dueDate ? dateToIso(row.dueDate) : null,
    speaking: row.speaking,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    submissions: members.map((m) => {
      const s = byMembership.get(m.id);
      return {
        membershipId: m.id,
        studentId: m.studentId,
        fullName: m.student.fullName,
        status: s?.status ?? null,
        note: s?.note ?? null,
        attachmentUrl: s?.attachmentUrl ?? null,
        submittedAt: s?.submittedAt.toISOString() ?? null,
        teacherComment: s?.teacherComment ?? null,
        teacherAudioUrl: s?.teacherAudioUrl ?? null,
        checkedByName: s?.checkedBy?.fullName ?? null,
      };
    }),
  };
}

async function findLessonInScope(db: DbClient, actor: Actor, lessonId: string) {
  const lesson = await mustFind(
    db.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { select: { id: true, branchId: true, name: true, status: true } } },
    }),
  );
  if (!actor.branchIds.includes(lesson.group.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (ownGroupsOnly(actor)) await findGroupInScope(db, actor, lesson.groupId, {});
  return lesson;
}

async function findHomeworkInScope(db: DbClient, actor: Actor, id: string) {
  const row = await mustFind(db.homework.findUnique({ where: { id }, include }));
  await findLessonInScope(db, actor, row.lessonId);
  return row;
}

/** Group → UY VAZIFASI tab. */
export async function listGroupHomework(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupHomeworkDto> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const horizon = isoToDate(today());
  horizon.setUTCDate(horizon.getUTCDate() + ASSIGNABLE_DAYS_AHEAD);
  const [rows, members, lessons] = await Promise.all([
    db.homework.findMany({
      where: { groupId },
      include,
      orderBy: [{ lesson: { date: "desc" } }, { createdAt: "desc" }],
    }),
    db.groupMembership.findMany({
      where: { groupId, status: { in: [...MEMBER_STATUSES] } },
      select: { id: true, studentId: true, student: { select: { fullName: true } } },
      orderBy: { student: { fullName: "asc" } },
    }),
    db.lesson.findMany({
      where: { groupId, date: { lte: horizon } },
      select: { id: true, date: true, topic: true, homework: { select: { id: true } } },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 80,
    }),
  ]);
  return {
    items: rows.map((r) => toDto(r, members)),
    lessons: lessons.map((l) => ({
      id: l.id,
      date: dateToIso(l.date),
      topic: l.topic,
      hasHomework: Boolean(l.homework),
    })),
  };
}

/** Sets (or replaces) the homework of a lesson. */
export async function setHomework(
  actor: Actor,
  lessonId: string,
  input: HomeworkInput,
  db: DbClient = prisma,
): Promise<HomeworkDto> {
  authorize(actor, "groups.attendance.mark");
  const lesson = await findLessonInScope(db, actor, lessonId);
  if (lesson.group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const data = {
    text: input.text,
    linkUrl: input.linkUrl ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    speaking: input.speaking ?? false,
    dueDate: input.dueDate ? isoToDate(input.dueDate) : null,
  };
  const row = await db.$transaction(async (tx) => {
    const before = await tx.homework.findUnique({ where: { lessonId } });
    const saved = await tx.homework.upsert({
      where: { lessonId },
      create: { ...data, lessonId, groupId: lesson.groupId, createdById: actor.userId },
      update: data,
      include,
    });
    await recordAudit(tx, actor, {
      action: before ? "homework.update" : "homework.create",
      entity: "Homework",
      entityId: saved.id,
      before: before ? { text: before.text, dueDate: before.dueDate } : undefined,
      after: { lessonDate: dateToIso(lesson.date), text: saved.text, dueDate: saved.dueDate },
      branchId: lesson.group.branchId,
    });
    // Students on Telegram hear about a new task, and about a changed text (A-103).
    if (!before || before.text !== saved.text) {
      await notifyHomework(tx, {
        kind: before ? "homeworkChanged" : "homeworkSet",
        homeworkId: saved.id,
        groupId: lesson.groupId,
        groupName: lesson.group.name,
        lessonDate: dateToIso(lesson.date),
        text: saved.text,
        stamp: saved.updatedAt.toISOString(),
      });
    }
    return saved;
  });
  const members = await db.groupMembership.findMany({
    where: { groupId: lesson.groupId, status: { in: [...MEMBER_STATUSES] } },
    select: { id: true, studentId: true, student: { select: { fullName: true } } },
    orderBy: { student: { fullName: "asc" } },
  });
  return toDto(row, members);
}

export async function deleteHomework(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const row = await findHomeworkInScope(db, actor, id);
  const lesson = await db.lesson.findUniqueOrThrow({
    where: { id: row.lessonId },
    select: { date: true, group: { select: { branchId: true } } },
  });
  await db.$transaction(async (tx) => {
    // Coins given for accepted answers go with the homework.
    await tx.coinTransaction.deleteMany({
      where: { kind: "AUTO", refKey: { startsWith: `homework:${id}:` } },
    });
    await tx.homework.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "homework.delete",
      entity: "Homework",
      entityId: id,
      before: { lessonDate: dateToIso(lesson.date), text: row.text },
      branchId: lesson.group.branchId,
    });
  });
}

/** The teacher accepts or returns one student's answer (or marks it done without one). */
export async function reviewSubmission(
  actor: Actor,
  homeworkId: string,
  membershipId: string,
  input: HomeworkReviewInput,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const row = await findHomeworkInScope(db, actor, homeworkId);
  const membership = await mustFind(
    db.groupMembership.findFirst({
      where: { id: membershipId, groupId: row.groupId },
      select: { id: true, studentId: true, groupId: true, group: { select: { branchId: true } } },
    }),
  );
  await db.$transaction(async (tx) => {
    const before = await tx.homeworkSubmission.findUnique({
      where: { homeworkId_membershipId: { homeworkId, membershipId } },
    });
    await tx.homeworkSubmission.upsert({
      where: { homeworkId_membershipId: { homeworkId, membershipId } },
      create: {
        homeworkId,
        membershipId,
        status: input.status,
        teacherComment: input.teacherComment ?? null,
        teacherAudioUrl: input.teacherAudioUrl ?? null,
        checkedById: actor.userId,
        checkedAt: new Date(),
      },
      update: {
        status: input.status,
        // An omitted comment keeps the earlier one; null clears it.
        ...(input.teacherComment !== undefined ? { teacherComment: input.teacherComment } : {}),
        ...(input.teacherAudioUrl !== undefined ? { teacherAudioUrl: input.teacherAudioUrl } : {}),
        checkedById: actor.userId,
        checkedAt: new Date(),
      },
    });
    await awardAutoCoins(tx, {
      event: "HOMEWORK",
      studentId: membership.studentId,
      groupId: membership.groupId,
      refKey: `homework:${homeworkId}:${membershipId}`,
      revoke: input.status !== "ACCEPTED",
    });
    if (!before || before.status !== input.status) {
      await notifyHomework(tx, {
        kind: input.status === "ACCEPTED" ? "homeworkAccepted" : "homeworkReturned",
        homeworkId,
        studentId: membership.studentId,
        groupName: row.group.name,
        lessonDate: dateToIso(row.lesson.date),
        comment: input.teacherComment ?? null,
        stamp: new Date().toISOString(),
      });
    }
    await recordAudit(tx, actor, {
      action: "homework.review",
      entity: "HomeworkSubmission",
      entityId: `${homeworkId}:${membershipId}`,
      before: before ? { status: before.status } : undefined,
      after: { status: input.status, teacherComment: input.teacherComment ?? null },
      branchId: membership.group.branchId,
    });
  });
}

/* ----- the student's side (no session: the link is the credential) ------------------------ */

/** Turns a stored `/api/v1/files/<key>` URL into one the student's link may open. */
function portalFileUrl(token: string, url: string | null): string | null {
  if (!url) return null;
  if (!url.startsWith("/api/v1/files/")) return url;
  return `/api/v1/public/class/${encodeURIComponent(token)}/files/${url.slice("/api/v1/files/".length)}`;
}

export async function listPortalHomework(
  token: string,
  db: DbClient = prisma,
): Promise<PortalHomeworkDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rows = await db.homework.findMany({
    where: { groupId: membership.groupId },
    include: {
      lesson: { select: { date: true, topic: true } },
      submissions: { where: { membershipId: membership.id } },
    },
    orderBy: [{ lesson: { date: "desc" } }, { createdAt: "desc" }],
  });
  return rows.map((r) => {
    const s = r.submissions[0];
    return {
      id: r.id,
      lessonDate: dateToIso(r.lesson.date),
      lessonTopic: r.lesson.topic,
      text: r.text,
      linkUrl: r.linkUrl,
      attachmentUrl: portalFileUrl(token, r.attachmentUrl),
      dueDate: r.dueDate ? dateToIso(r.dueDate) : null,
      speaking: r.speaking,
      submission: s
        ? {
            status: s.status,
            note: s.note,
            attachmentUrl: portalFileUrl(token, s.attachmentUrl),
            submittedAt: s.submittedAt.toISOString(),
            teacherComment: s.teacherComment,
            teacherAudioUrl: portalFileUrl(token, s.teacherAudioUrl),
          }
        : null,
    };
  });
}

/** The student hands in (or re-hands in) an answer; an accepted one is final. */
export async function submitHomework(
  token: string,
  homeworkId: string,
  input: HomeworkSubmissionInput,
  db: DbClient = prisma,
): Promise<void> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const homework = await db.homework.findFirst({
    where: { id: homeworkId, groupId: membership.groupId },
    select: { id: true },
  });
  if (!homework) throw AppError.notFound();
  if (!input.note && !input.attachmentUrl) {
    throw AppError.validation({ note: ["validation.homeworkEmpty"] });
  }
  const existing = await db.homeworkSubmission.findUnique({
    where: { homeworkId_membershipId: { homeworkId, membershipId: membership.id } },
  });
  if (existing?.status === "ACCEPTED") throw AppError.conflict("errors.homeworkAccepted");
  await db.homeworkSubmission.upsert({
    where: { homeworkId_membershipId: { homeworkId, membershipId: membership.id } },
    create: {
      homeworkId,
      membershipId: membership.id,
      note: input.note ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
    },
    update: {
      status: "SUBMITTED",
      note: input.note ?? null,
      attachmentUrl: input.attachmentUrl ?? null,
      submittedAt: new Date(),
      teacherComment: null,
      teacherAudioUrl: null,
      checkedById: null,
      checkedAt: null,
    },
  });
}

/**
 * Whether a student's link may open a stored file: the file must belong to a
 * homework of their group, their own answer, a lesson or a material of their group.
 */
export async function portalFileAllowed(
  token: string,
  key: string,
  db: DbClient = prisma,
): Promise<boolean> {
  if (!STORAGE_KEY_PATTERN.test(key)) return false;
  const membership = await membershipByToken(db, token);
  if (!membership) return false;
  const url = `/api/v1/files/${key}`;
  const [homework, own, lesson, material] = await Promise.all([
    db.homework.count({ where: { groupId: membership.groupId, attachmentUrl: url } }),
    db.homeworkSubmission.count({
      where: {
        membershipId: membership.id,
        OR: [{ attachmentUrl: url }, { teacherAudioUrl: url }],
      },
    }),
    db.lesson.count({ where: { groupId: membership.groupId, attachmentUrl: url } }),
    db.lessonMaterial.count({ where: { groupId: membership.groupId, url } }),
  ]);
  return homework + own + lesson + material > 0;
}
