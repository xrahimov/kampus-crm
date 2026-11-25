/**
 * Deleting one's own account (A-267) against the real database: a student or
 * parent deletes theirs at once and the centre's records stay; a staff member
 * asks, and those who may archive staff are told.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  deleteStudentAccount,
  requestStaffDeletion,
  withdrawStaffDeletion,
} from "@/server/services/account-deletion.service";
import { getAccount } from "@/server/services/account.service";
import {
  accountForIdentity,
  createStudentSession,
  resolveStudentSession,
} from "@/server/services/student-auth/student-auth.service";

const RUN = String(Date.now()).slice(-7);
const TAG = `del${RUN}`;
const phone = (n: number) => `+9989${RUN}${n}`;
const tg = (n: number) => `7${RUN}${n}`;

let orgId: string;
let branchId: string;
let teacherId: string;
let directorId: string;
let cashierId: string;
let studentId: string;
let childId: string;

const actorFor = (userId: string): Actor => ({
  userId,
  fullName: "x",
  organizationId: orgId,
  roles: [],
  permissions: [],
  branchIds: [branchId],
  activeBranchId: branchId,
});

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { name: `${TAG} Org` } })).id;
  branchId = (await prisma.branch.create({ data: { organizationId: orgId, name: `${TAG} B` } })).id;
  const role = (code: string, permissions: string[]) =>
    prisma.role.create({
      data: { organizationId: orgId, code: `${TAG}_${code}`, name: code, permissions },
    });
  const director = await role("DIRECTOR", ["staff.view", "staff.delete"]);
  const plain = await role("PLAIN", ["groups.view"]);
  const make = async (n: number, name: string, roleId: string) =>
    (
      await prisma.user.create({
        data: {
          organizationId: orgId,
          phone: phone(n),
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          branches: { create: { branchId } },
          roles: { create: { roleId } },
        },
      })
    ).id;
  teacherId = await make(1, "Teacher", plain.id);
  directorId = await make(2, "Director", director.id);
  cashierId = await make(3, "Cashier", plain.id);
  studentId = (
    await prisma.student.create({ data: { branchId, fullName: `${TAG} Ali`, phone: phone(4) } })
  ).id;
  childId = (
    await prisma.student.create({ data: { branchId, fullName: `${TAG} Child`, phone: phone(5) } })
  ).id;
  await prisma.parent.create({
    data: { studentId: childId, fullName: `${TAG} Mum`, phone: phone(4) },
  });
});

afterAll(async () => {
  await prisma.studentAccount.deleteMany({ where: { telegramUserId: { startsWith: `7${RUN}` } } });
  await prisma.telegramContact.deleteMany({ where: { botOrganizationId: orgId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.role.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("a student or parent deletes their own account (A-267)", () => {
  it("removes the account, its sessions and what the bot kept, and leaves the centre's records", async () => {
    const identity = {
      telegramUserId: tg(1),
      name: `${TAG} TG`,
      username: null,
      photoUrl: null,
      phone: phone(4).slice(1),
    };
    const account = await accountForIdentity(prisma, identity, orgId);
    // The same phone is the student's own and the mother's of another student.
    expect(await prisma.studentAccountLink.count({ where: { accountId: account.id } })).toBe(2);
    const here = await createStudentSession(prisma, account.id, { ip: "10.6.0.1" });
    const there = await createStudentSession(prisma, account.id, { ip: "10.6.0.2" });
    await prisma.telegramContact.create({
      data: {
        botOrganizationId: orgId,
        telegramUserId: tg(1),
        chatId: tg(1),
        phone: phone(4),
        name: identity.name,
      },
    });
    await prisma.studentTelegramChat.create({ data: { studentId, chatId: tg(1) } });
    await prisma.phoneSignInCode.create({
      data: {
        id: `${TAG}-code`,
        phone: phone(4),
        door: "STUDENT",
        botOrganizationId: orgId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const principal = await resolveStudentSession(prisma, here);
    expect(principal).not.toBeNull();
    await deleteStudentAccount(principal!);

    expect(await prisma.studentAccount.count({ where: { id: account.id } })).toBe(0);
    expect(await resolveStudentSession(prisma, here)).toBeNull();
    expect(await resolveStudentSession(prisma, there)).toBeNull();
    expect(await prisma.studentAccountLink.count({ where: { accountId: account.id } })).toBe(0);
    expect(await prisma.telegramContact.count({ where: { telegramUserId: tg(1) } })).toBe(0);
    expect(await prisma.studentTelegramChat.count({ where: { chatId: tg(1) } })).toBe(0);
    expect(await prisma.phoneSignInCode.count({ where: { phone: phone(4) } })).toBe(0);
    // The centre's own records are the centre's.
    expect(await prisma.student.count({ where: { id: { in: [studentId, childId] } } })).toBe(2);
    expect(await prisma.parent.count({ where: { studentId: childId } })).toBe(1);
    const log = await prisma.auditLog.findMany({
      where: { organizationId: orgId, action: "student.account.delete" },
      select: { entityId: true, after: true },
    });
    expect(log.map((row) => row.entityId).sort()).toEqual([studentId, childId].sort());

    // Pressed again on another device: nothing is left to delete, and nothing breaks.
    await expect(deleteStudentAccount(principal!)).resolves.toBeUndefined();

    // Deleting is not a ban: signing in again opens a new account.
    const again = await accountForIdentity(prisma, identity, orgId);
    expect(again.id).not.toBe(account.id);
    expect(again.passwordHash).toBeNull();
  });
});

describe("a staff member asks for their account to be deleted (A-267)", () => {
  it("keeps the date, tells those who may archive staff, and can be taken back", async () => {
    const teacher = actorFor(teacherId);
    expect((await getAccount(teacher)).deletionRequestedAt).toBeNull();

    const asked = await requestStaffDeletion(teacher);
    expect((await getAccount(teacher)).deletionRequestedAt).toBe(asked.requestedAt);
    const notices = await prisma.notification.findMany({
      where: { kind: "ACCOUNT_DELETION", user: { organizationId: orgId } },
      select: { userId: true, params: true, href: true },
    });
    // The director only: not the cashier, and not the person who asked.
    expect(notices.map((n) => n.userId)).toEqual([directorId]);
    expect(notices[0]!.params).toEqual({
      name: `${TAG} Teacher`,
      phone: phone(1),
      userId: teacherId,
    });
    expect(notices[0]!.href).toBe("/settings/staff");
    expect(cashierId).not.toBe(directorId);

    // Asking twice changes nothing and tells nobody again.
    expect((await requestStaffDeletion(teacher)).requestedAt).toBe(asked.requestedAt);
    expect(
      await prisma.notification.count({
        where: { kind: "ACCOUNT_DELETION", user: { organizationId: orgId } },
      }),
    ).toBe(1);

    // Someone else's request is its own: the teacher's withdrawal leaves it alone.
    await requestStaffDeletion(actorFor(cashierId));

    await withdrawStaffDeletion(teacher);
    expect((await getAccount(teacher)).deletionRequestedAt).toBeNull();
    // The director's bell no longer says to archive the teacher.
    const left = await prisma.notification.findMany({
      where: { kind: "ACCOUNT_DELETION", user: { organizationId: orgId } },
      select: { params: true },
    });
    expect(left.map((n) => (n.params as { userId: string }).userId)).toEqual([cashierId]);
    const actions = (
      await prisma.auditLog.findMany({
        where: { organizationId: orgId, entityId: teacherId },
        orderBy: { createdAt: "asc" },
        select: { action: true },
      })
    ).map((row) => row.action);
    expect(actions).toEqual(["auth.deletionRequest", "auth.deletionWithdraw"]);
    // The account itself is untouched: only the director archives it.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(user.isArchived).toBe(false);
  });
});
