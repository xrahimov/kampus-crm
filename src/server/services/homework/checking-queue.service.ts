import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { groupScope } from "@/server/services/groups/shared";
import { dateToIso } from "@/server/services/settings/shared";

/**
 * The teacher's checking queue (A-160, online-lessons item C7): every homework
 * answer waiting for a verdict across the groups the actor may mark, oldest
 * first. A verdict is `reviewSubmission`; this module only lists.
 */

export interface CheckingItemDto {
  homeworkId: string;
  membershipId: string;
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  lessonDate: string;
  lessonTopic: string | null;
  /** The task as set. */
  text: string;
  linkUrl: string | null;
  speaking: boolean;
  /** The student's answer. */
  note: string | null;
  attachmentUrl: string | null;
  submittedAt: string;
}

export interface CheckingQueueDto {
  items: CheckingItemDto[];
  /** All waiting answers, also beyond the page. */
  total: number;
}

const PAGE = 100;

function waiting(actor: Actor): Prisma.HomeworkSubmissionWhereInput {
  return {
    status: "SUBMITTED",
    homework: { group: { ...groupScope(actor), status: { not: "ARCHIVED" } } },
    membership: {
      status: { in: ["NEW", "TRIAL", "ACTIVE", "FROZEN"] },
      student: { isArchived: false },
    },
  };
}

/** The oldest `PAGE` waiting answers in the actor's groups, and how many there are in all. */
export async function listCheckingQueue(
  actor: Actor,
  db: DbClient = prisma,
): Promise<CheckingQueueDto> {
  authorize(actor, "groups.attendance.mark");
  const where = waiting(actor);
  const [rows, total] = await Promise.all([
    db.homeworkSubmission.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      take: PAGE,
      select: {
        homeworkId: true,
        membershipId: true,
        note: true,
        attachmentUrl: true,
        submittedAt: true,
        homework: {
          select: {
            text: true,
            linkUrl: true,
            speaking: true,
            lesson: {
              select: { date: true, topic: true, courseTopic: { select: { title: true } } },
            },
            group: { select: { id: true, name: true } },
          },
        },
        membership: { select: { student: { select: { id: true, fullName: true } } } },
      },
    }),
    db.homeworkSubmission.count({ where }),
  ]);
  return {
    total,
    items: rows.map((r) => ({
      homeworkId: r.homeworkId,
      membershipId: r.membershipId,
      studentId: r.membership.student.id,
      fullName: r.membership.student.fullName,
      groupId: r.homework.group.id,
      groupName: r.homework.group.name,
      lessonDate: dateToIso(r.homework.lesson.date),
      lessonTopic: r.homework.lesson.topic ?? r.homework.lesson.courseTopic?.title ?? null,
      text: r.homework.text,
      linkUrl: r.homework.linkUrl,
      speaking: r.homework.speaking,
      note: r.note,
      attachmentUrl: r.attachmentUrl,
      submittedAt: r.submittedAt.toISOString(),
    })),
  };
}

/** How many answers wait for the actor; 0 for those who may not mark. */
export async function countCheckingQueue(actor: Actor, db: DbClient = prisma): Promise<number> {
  if (!actor.permissions.includes("*") && !actor.permissions.includes("groups.attendance.mark")) {
    return 0;
  }
  return db.homeworkSubmission.count({ where: waiting(actor) });
}
