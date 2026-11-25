import type { ReviewSignInInput, ReviewSignInKind } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { generateToken } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorizeSiteOwner, type Actor } from "@/server/rbac/authorize";

/*
 * Sign-ins for app store reviewers (A-272). Apple and Google sign in to the app
 * before they let it into their stores, and their reviewers cannot get a
 * Telegram code, which the first sign-in otherwise asks for (A-196). The site
 * owner marks a staff member and a student of their own centre and types a
 * password for each; that password then works by itself.
 *
 * It never takes over a real person's account: someone who has signed in with
 * Telegram themself is refused, so only accounts nobody uses (the demo teacher,
 * a demo student) can be marked. Taking the mark away ends the sign-in.
 */

export interface ReviewSignInDto {
  kind: ReviewSignInKind;
  /** The staff member's id, or the student's. */
  id: string;
  fullName: string;
  phone: string;
  since: string;
}

/** The id a reviewer's student account carries in place of a Telegram one. */
const reviewTelegramId = (studentId: string) => `review-${studentId}`;

export async function listReviewSignIns(
  actor: Actor,
  db: DbClient = prisma,
): Promise<ReviewSignInDto[]> {
  authorizeSiteOwner(actor);
  const [staff, accounts] = await Promise.all([
    db.user.findMany({
      where: { organizationId: actor.organizationId, reviewSignInAt: { not: null } },
      select: { id: true, fullName: true, phone: true, reviewSignInAt: true },
      orderBy: { reviewSignInAt: "asc" },
    }),
    db.studentAccount.findMany({
      where: {
        reviewSignInAt: { not: null },
        links: { some: { organizationId: actor.organizationId, studentId: { not: null } } },
      },
      select: {
        phone: true,
        reviewSignInAt: true,
        links: { select: { student: { select: { id: true, fullName: true } } } },
      },
      orderBy: { reviewSignInAt: "asc" },
    }),
  ]);
  return [
    ...staff.map((u) => ({
      kind: "STAFF" as const,
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      since: u.reviewSignInAt!.toISOString(),
    })),
    ...accounts.flatMap((a) => {
      const student = a.links.find((l) => l.student)?.student;
      if (!student) return [];
      return [
        {
          kind: "STUDENT" as const,
          id: student.id,
          fullName: student.fullName,
          phone: a.phone ?? "",
          since: a.reviewSignInAt!.toISOString(),
        },
      ];
    }),
  ];
}

/** Marks the person with this phone and gives them the password; again, to change the password. */
export async function setReviewSignIn(
  actor: Actor,
  input: ReviewSignInInput,
  db: DbClient = prisma,
): Promise<ReviewSignInDto> {
  authorizeSiteOwner(actor);
  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  return input.kind === "STAFF"
    ? setForStaff(db, actor, input.phone, passwordHash, now)
    : setForStudent(db, actor, input.phone, passwordHash, now);
}

async function setForStaff(
  db: DbClient,
  actor: Actor,
  phone: string,
  passwordHash: string,
  now: Date,
): Promise<ReviewSignInDto> {
  const user = await db.user.findFirst({
    where: { organizationId: actor.organizationId, phone, isArchived: false },
    select: {
      id: true,
      fullName: true,
      phone: true,
      isSiteOwner: true,
      telegramVerifiedAt: true,
      reviewSignInAt: true,
    },
  });
  if (!user) throw AppError.notFound("errors.reviewSignInNobody");
  // Their own account, or one a real person has proven with Telegram, is never handed out.
  if (
    user.isSiteOwner ||
    user.id === actor.userId ||
    (user.telegramVerifiedAt && !user.reviewSignInAt)
  ) {
    throw AppError.conflict("errors.reviewSignInRealPerson");
  }
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // The reviewer signs in and looks around; nothing asks them to choose another password.
        mustChangePassword: false,
        passwordChangedAt: now,
        signInCode: "OFF",
        telegramVerifiedAt: now,
        reviewSignInAt: user.reviewSignInAt ?? now,
      },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await recordAudit(tx, actor, {
      action: "reviewSignIn.set",
      entity: "User",
      entityId: user.id,
      after: { kind: "STAFF", fullName: user.fullName },
      branchId: null,
    });
    return {
      kind: "STAFF" as const,
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      since: (user.reviewSignInAt ?? now).toISOString(),
    };
  });
}

async function setForStudent(
  db: DbClient,
  actor: Actor,
  phone: string,
  passwordHash: string,
  now: Date,
): Promise<ReviewSignInDto> {
  const students = await db.student.findMany({
    where: { phone, isArchived: false, branch: { organizationId: actor.organizationId } },
    select: {
      id: true,
      fullName: true,
      accountLinks: { select: { account: { select: { id: true, reviewSignInAt: true } } } },
    },
    take: 2,
  });
  if (students.length === 0) throw AppError.notFound("errors.reviewSignInNobody");
  if (students.length > 1) throw AppError.conflict("errors.reviewSignInSharedPhone");
  const student = students[0]!;
  const linked = student.accountLinks[0]?.account ?? null;
  // A student who has signed in themself, or a number someone has proven with Telegram
  // (a parent's, say), belongs to a real person.
  if (linked && !linked.reviewSignInAt) throw AppError.conflict("errors.reviewSignInRealPerson");
  const proven = await db.studentAccount.count({ where: { phone, reviewSignInAt: null } });
  if (proven > 0) throw AppError.conflict("errors.reviewSignInRealPerson");

  return db.$transaction(async (tx) => {
    let since = now;
    if (linked) {
      const row = await tx.studentAccount.update({
        where: { id: linked.id },
        data: { passwordHash, passwordSetAt: now, phone },
        select: { reviewSignInAt: true },
      });
      since = row.reviewSignInAt ?? now;
      await tx.studentSession.deleteMany({ where: { accountId: linked.id } });
    } else {
      await tx.studentAccount.create({
        data: {
          telegramUserId: reviewTelegramId(student.id),
          phone,
          name: student.fullName,
          locale: "en",
          passwordHash,
          passwordSetAt: now,
          passwordOfferedAt: now,
          reviewSignInAt: now,
          links: {
            create: {
              studentId: student.id,
              organizationId: actor.organizationId,
              via: "STAFF",
              linkedById: actor.userId,
            },
          },
        },
      });
    }
    await recordAudit(tx, actor, {
      action: "reviewSignIn.set",
      entity: "Student",
      entityId: student.id,
      after: { kind: "STUDENT", fullName: student.fullName },
      branchId: null,
    });
    return {
      kind: "STUDENT" as const,
      id: student.id,
      fullName: student.fullName,
      phone,
      since: since.toISOString(),
    };
  });
}

/** Ends a reviewer's sign-in: the password stops working and they are signed out. */
export async function removeReviewSignIn(
  actor: Actor,
  kind: ReviewSignInKind,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorizeSiteOwner(actor);
  if (kind === "STAFF") {
    const user = await db.user.findFirst({
      where: { id, organizationId: actor.organizationId, reviewSignInAt: { not: null } },
      select: { id: true, fullName: true },
    });
    if (!user) throw AppError.notFound();
    // Back to an account nobody has signed in to: a password nobody knows, Telegram first.
    const passwordHash = await hashPassword(generateToken(24));
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          telegramVerifiedAt: null,
          reviewSignInAt: null,
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await recordAudit(tx, actor, {
        action: "reviewSignIn.remove",
        entity: "User",
        entityId: user.id,
        before: { kind: "STAFF", fullName: user.fullName },
        branchId: null,
      });
    });
    return;
  }
  const link = await db.studentAccountLink.findFirst({
    where: {
      studentId: id,
      organizationId: actor.organizationId,
      account: { reviewSignInAt: { not: null } },
    },
    select: { accountId: true, student: { select: { fullName: true } } },
  });
  if (!link) throw AppError.notFound();
  await db.$transaction(async (tx) => {
    // The account exists only for the reviewer; its link and sessions go with it.
    await tx.studentAccount.delete({ where: { id: link.accountId } });
    await recordAudit(tx, actor, {
      action: "reviewSignIn.remove",
      entity: "Student",
      entityId: id,
      before: { kind: "STUDENT", fullName: link.student?.fullName ?? null },
      branchId: null,
    });
  });
}
