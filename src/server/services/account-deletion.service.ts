import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import type { StudentPrincipal } from "@/server/services/student-auth/student-auth.service";

/*
 * Deleting one's own account (A-267), which the app stores ask of every app
 * that lets people open an account.
 *
 * A student or a parent opened theirs by signing in, so they delete it
 * themselves, at once. A staff account was opened by the learning centre and
 * carries the centre's history (lessons taught, payments taken), so the person
 * asks and those who manage staff archive it.
 *
 * In both cases the centre's own records stay: they are the centre's.
 */

/**
 * Deletes the sign-in account of a student or parent: the account with its
 * password, its sessions on every device and its links to student records, what
 * the bot remembered of this Telegram user, and the Telegram chat's link to the
 * centre's notices. Student records, marks and payments are the centre's and stay.
 */
export async function deleteStudentAccount(
  principal: StudentPrincipal,
  db: DbClient = prisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const account = await tx.studentAccount.findUnique({
      where: { id: principal.account.id },
      select: {
        id: true,
        telegramUserId: true,
        phone: true,
        links: {
          select: {
            organizationId: true,
            student: { select: { id: true, branchId: true } },
            parent: { select: { student: { select: { id: true, branchId: true } } } },
          },
        },
      },
    });
    // Pressed twice, or on two devices: the second finds nothing left to delete.
    if (!account) return;
    for (const link of account.links) {
      const student = link.student ?? link.parent?.student;
      if (!student) continue;
      await recordAudit(tx, null, {
        action: "student.account.delete",
        entity: "Student",
        entityId: student.id,
        after: { by: link.student ? "student" : "parent" },
        branchId: student.branchId,
        organizationId: link.organizationId,
      });
    }
    // A private chat's id is the Telegram user's own id.
    await tx.studentTelegramChat.deleteMany({ where: { chatId: account.telegramUserId } });
    await tx.telegramContact.deleteMany({ where: { telegramUserId: account.telegramUserId } });
    if (account.phone) {
      await tx.phoneSignInCode.deleteMany({ where: { phone: account.phone, door: "STUDENT" } });
    }
    // Sessions, sign-in links and links to student records go with the account.
    await tx.studentAccount.delete({ where: { id: account.id } });
  });
}

/**
 * A staff member asks for their account to be deleted: the date is kept on the
 * account and everyone else who may archive staff is told. Asking again changes
 * nothing.
 */
export async function requestStaffDeletion(
  actor: Actor,
  db: DbClient = prisma,
): Promise<{ requestedAt: string }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { fullName: true, phone: true, deletionRequestedAt: true },
    });
    if (user.deletionRequestedAt) return { requestedAt: user.deletionRequestedAt.toISOString() };
    const now = new Date();
    await tx.user.update({ where: { id: actor.userId }, data: { deletionRequestedAt: now } });
    await recordAudit(tx, actor, {
      action: "auth.deletionRequest",
      entity: "User",
      entityId: actor.userId,
      after: { requestedAt: now.toISOString() },
    });
    await notifyUsers(tx, {
      kind: "ACCOUNT_DELETION",
      params: { name: user.fullName, phone: user.phone },
      href: "/settings/staff",
      organizationId: actor.organizationId,
      permission: "staff.delete",
      excludeUserId: actor.userId,
    });
    return { requestedAt: now.toISOString() };
  });
}

/** The person changed their mind before the account was archived. */
export async function withdrawStaffDeletion(actor: Actor, db: DbClient = prisma): Promise<void> {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { deletionRequestedAt: true },
    });
    if (!user.deletionRequestedAt) return;
    await tx.user.update({ where: { id: actor.userId }, data: { deletionRequestedAt: null } });
    await recordAudit(tx, actor, {
      action: "auth.deletionWithdraw",
      entity: "User",
      entityId: actor.userId,
      before: { requestedAt: user.deletionRequestedAt.toISOString() },
    });
  });
}
