/**
 * Sign-ins for app store reviewers (A-272), against the real database, in a
 * centre whose Telegram bot is set up: there a password alone opens nothing
 * until the phone has come in with a code once (A-196), which a reviewer
 * cannot do.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  listReviewSignIns,
  removeReviewSignIn,
  setReviewSignIn,
} from "@/server/services/settings/review-sign-ins.service";
import { passwordSignIn } from "@/server/services/sign-in/password.service";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `rv${RUN}`;
const PASSWORD = "review-password-1";
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
let ipCounter = 0;
const ctx = () => ({ ip: `10.8.${Number(RUN) % 250}.${(ipCounter += 1)}`, userAgent: "vitest" });
const signIn = (n: number, door: "STAFF" | "STUDENT", password = PASSWORD) =>
  passwordSignIn({ phone: phone(n), password, door, scopeOrganizationId: null }, ctx());

let orgId: string;
let branchId: string;
let teacherId: string;
let studentId: string;
const owner: Actor = {
  userId: "",
  fullName: "Owner",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: "",
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};

beforeAll(async () => {
  process.env.TELEGRAM_LOGIN_FAKE = "1";
  const org = await prisma.organization.create({ data: { name: `${TAG} centre` } });
  orgId = org.id;
  owner.organizationId = org.id;
  branchId = (await prisma.branch.create({ data: { organizationId: org.id, name: `${TAG} A` } }))
    .id;
  owner.branchIds = [branchId];
  await prisma.integrationSetting.create({
    data: {
      organizationId: org.id,
      provider: "TELEGRAM",
      isEnabled: true,
      config: { botToken: "", botUsername: `${TAG}_bot`, webhookSecret: `${TAG}-secret` },
    },
  });
  const unknown = await hashPassword("nobody-knows-this-1");
  const user = (n: number, fullName: string, extra: object = {}) =>
    prisma.user.create({
      data: {
        organizationId: org.id,
        phone: phone(n),
        fullName,
        passwordHash: unknown,
        mustChangePassword: true,
        branches: { create: { branchId } },
        ...extra,
      },
    });
  owner.userId = (
    await user(1, `${TAG} Owner`, { isSiteOwner: true, telegramVerifiedAt: new Date() })
  ).id;
  teacherId = (await user(2, `${TAG} Demo Teacher`)).id;
  // A real teacher: they came in with a Telegram code themself.
  await user(3, `${TAG} Real Teacher`, { telegramVerifiedAt: new Date() });
  studentId = (
    await prisma.student.create({
      data: { branchId, fullName: `${TAG} Demo Student`, phone: phone(4), gender: "FEMALE" },
    })
  ).id;
  // Two children on one parent's number.
  for (const name of ["One", "Two"]) {
    await prisma.student.create({
      data: { branchId, fullName: `${TAG} Sibling ${name}`, phone: phone(5), gender: "MALE" },
    });
  }
  // A real student, who signed in with Telegram.
  const real = await prisma.student.create({
    data: { branchId, fullName: `${TAG} Real Student`, phone: phone(6), gender: "MALE" },
  });
  await prisma.studentAccount.create({
    data: {
      telegramUserId: `7${RUN}006`,
      phone: phone(6),
      name: `${TAG} Real Student`,
      links: { create: { studentId: real.id, organizationId: org.id, via: "PHONE" } },
    },
  });
});

afterAll(async () => {
  delete process.env.TELEGRAM_LOGIN_FAKE;
  const phones = { startsWith: `+99896${RUN}` };
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: `+99896${RUN}` } } });
  await prisma.loginLog.deleteMany({ where: { phone: phones } });
  await prisma.studentAccount.deleteMany({ where: { phone: phones } });
  await prisma.student.deleteMany({ where: { phone: phones } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.user.deleteMany({ where: { phone: phones } });
  await prisma.integrationSetting.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("a reviewer's sign-in for a staff member (A-272)", () => {
  it("is the site owner's alone to give", async () => {
    await expect(
      setReviewSignIn(
        { ...owner, isSiteOwner: false },
        { kind: "STAFF", phone: phone(2), password: PASSWORD },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(listReviewSignIns({ ...owner, isSiteOwner: false })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("makes the password work without a Telegram code, and nothing asks for a new one", async () => {
    const saved = await setReviewSignIn(owner, {
      kind: "STAFF",
      phone: phone(2),
      password: PASSWORD,
    });
    expect(saved).toMatchObject({ kind: "STAFF", id: teacherId, phone: phone(2) });

    const result = await signIn(2, "STAFF");
    expect(result).toMatchObject({ kind: "staff", outcome: { kind: "session" } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(row.mustChangePassword).toBe(false);
    expect(row.reviewSignInAt).not.toBeNull();
    expect(await listReviewSignIns(owner)).toEqual([
      expect.objectContaining({ kind: "STAFF", id: teacherId }),
    ]);
  });

  it("takes a new password for the same person and ends the sessions of the old one", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    await setReviewSignIn(owner, {
      kind: "STAFF",
      phone: phone(2),
      password: "another-password-2",
    });
    expect(await prisma.session.count({ where: { userId: teacherId } })).toBe(0);
    await expect(signIn(2, "STAFF")).rejects.toMatchObject({ status: 401 });
    await expect(signIn(2, "STAFF", "another-password-2")).resolves.toMatchObject({
      kind: "staff",
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(after.reviewSignInAt).toEqual(before.reviewSignInAt);
  });

  it("refuses a real person, the owner and a number nobody has", async () => {
    for (const n of [1, 3]) {
      await expect(
        setReviewSignIn(owner, { kind: "STAFF", phone: phone(n), password: PASSWORD }),
      ).rejects.toMatchObject({ message: "errors.reviewSignInRealPerson" });
    }
    await expect(
      setReviewSignIn(owner, { kind: "STAFF", phone: phone(9), password: PASSWORD }),
    ).rejects.toMatchObject({ message: "errors.reviewSignInNobody" });
  });

  it("ends when it is removed: Telegram is asked for again", async () => {
    await removeReviewSignIn(owner, "STAFF", teacherId);
    await expect(signIn(2, "STAFF", "another-password-2")).rejects.toMatchObject({ status: 401 });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(row.telegramVerifiedAt).toBeNull();
    expect(row.reviewSignInAt).toBeNull();
    expect(await listReviewSignIns(owner)).toEqual([]);
    await expect(removeReviewSignIn(owner, "STAFF", teacherId)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("a reviewer's sign-in for a student (A-272)", () => {
  it("opens the student's own pages with phone and password", async () => {
    const saved = await setReviewSignIn(owner, {
      kind: "STUDENT",
      phone: phone(4),
      password: PASSWORD,
    });
    expect(saved).toMatchObject({ kind: "STUDENT", id: studentId, phone: phone(4) });

    const result = await signIn(4, "STUDENT");
    if (result.kind !== "student") throw new Error("expected a student session");
    const principal = await resolveStudentSession(prisma, result.token);
    expect(principal?.studentIds).toEqual([studentId]);
    expect(await listReviewSignIns(owner)).toEqual([
      expect.objectContaining({ kind: "STUDENT", id: studentId }),
    ]);
  });

  it("changes the password on a second save without making a second account", async () => {
    await setReviewSignIn(owner, {
      kind: "STUDENT",
      phone: phone(4),
      password: "another-password-2",
    });
    expect(await prisma.studentAccount.count({ where: { phone: phone(4) } })).toBe(1);
    await expect(signIn(4, "STUDENT")).rejects.toMatchObject({ status: 401 });
    await expect(signIn(4, "STUDENT", "another-password-2")).resolves.toMatchObject({
      kind: "student",
    });
  });

  it("refuses a real student and a number two students share", async () => {
    await expect(
      setReviewSignIn(owner, { kind: "STUDENT", phone: phone(6), password: PASSWORD }),
    ).rejects.toMatchObject({ message: "errors.reviewSignInRealPerson" });
    await expect(
      setReviewSignIn(owner, { kind: "STUDENT", phone: phone(5), password: PASSWORD }),
    ).rejects.toMatchObject({ message: "errors.reviewSignInSharedPhone" });
  });

  it("is gone with its sessions when removed; the student's record stays", async () => {
    await removeReviewSignIn(owner, "STUDENT", studentId);
    expect(await prisma.studentAccount.count({ where: { phone: phone(4) } })).toBe(0);
    await expect(signIn(4, "STUDENT", "another-password-2")).rejects.toMatchObject({
      status: 401,
    });
    expect(await prisma.student.count({ where: { id: studentId } })).toBe(1);
  });
});
