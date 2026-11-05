import type { StudentLinkVia } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { studentScope } from "@/server/services/students/students.service";

/*
 * Staff's view of who may sign in to Kampus as a student or as their parent
 * (A-150): the Telegram accounts linked to the student and to their parents'
 * records, with unlink and "sign out on every device".
 */

export interface StudentAccessDto {
  linkId: string;
  /** Whose record the link is on: the student's own, or one of their parents'. */
  who: { kind: "STUDENT" } | { kind: "PARENT"; name: string };
  telegramName: string;
  telegramUsername: string | null;
  phone: string | null;
  via: StudentLinkVia;
  linkedAt: string;
  lastSeenAt: string | null;
  devices: number;
}

async function studentInScope(db: DbClient, actor: Actor, studentId: string) {
  const student = await db.student.findFirst({
    where: { id: studentId, ...studentScope(actor) },
    select: { id: true, branchId: true, parents: { select: { id: true } } },
  });
  if (!student) throw AppError.notFound("errors.studentNotFound");
  return student;
}

export async function listStudentAccess(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<StudentAccessDto[]> {
  authorize(actor, "students.view");
  const student = await studentInScope(db, actor, studentId);
  const links = await db.studentAccountLink.findMany({
    where: {
      OR: [{ studentId }, { parentId: { in: student.parents.map((p) => p.id) } }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      parent: { select: { fullName: true } },
      account: { include: { _count: { select: { sessions: true } } } },
    },
  });
  return links.map((l) => ({
    linkId: l.id,
    who: l.parent ? { kind: "PARENT", name: l.parent.fullName } : { kind: "STUDENT" },
    telegramName: l.account.name,
    telegramUsername: l.account.username,
    phone: l.account.phone,
    via: l.via,
    linkedAt: l.createdAt.toISOString(),
    lastSeenAt: l.account.lastSeenAt?.toISOString() ?? null,
    devices: l.account._count.sessions,
  }));
}

async function linkOfStudent(db: DbClient, actor: Actor, studentId: string, linkId: string) {
  const student = await studentInScope(db, actor, studentId);
  const link = await db.studentAccountLink.findFirst({
    where: {
      id: linkId,
      OR: [{ studentId }, { parentId: { in: student.parents.map((p) => p.id) } }],
    },
    include: { account: { select: { id: true, name: true, username: true } } },
  });
  if (!link) throw AppError.notFound();
  return { student, link };
}

/**
 * Takes the link away: the Telegram account no longer opens this student. The
 * account's devices are signed out when nothing else is left for it to open.
 */
export async function unlinkStudentAccess(
  actor: Actor,
  studentId: string,
  linkId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const { student, link } = await linkOfStudent(db, actor, studentId, linkId);
  await db.$transaction(async (tx) => {
    await tx.studentAccountLink.delete({ where: { id: link.id } });
    const left = await tx.studentAccountLink.count({ where: { accountId: link.account.id } });
    if (left === 0) await tx.studentSession.deleteMany({ where: { accountId: link.account.id } });
    await recordAudit(tx, actor, {
      action: "student.account.unlink",
      entity: "Student",
      entityId: studentId,
      before: { telegram: link.account.username ?? link.account.name, via: link.via },
      branchId: student.branchId,
    });
  });
}

/** Signs the linked account out on every device; it can sign in again with Telegram. */
export async function signOutStudentAccess(
  actor: Actor,
  studentId: string,
  linkId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const { student, link } = await linkOfStudent(db, actor, studentId, linkId);
  await db.$transaction(async (tx) => {
    await tx.studentSession.deleteMany({ where: { accountId: link.account.id } });
    await recordAudit(tx, actor, {
      action: "student.account.signOut",
      entity: "Student",
      entityId: studentId,
      after: { telegram: link.account.username ?? link.account.name },
      branchId: student.branchId,
    });
  });
}
