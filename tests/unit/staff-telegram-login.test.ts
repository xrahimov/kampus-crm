/**
 * Staff sign-in with Telegram (A-180, A-196), against the real database: the
 * phone Telegram vouches for opens the staff account that has it and no other;
 * a password opens nothing until the person has come in with Telegram once,
 * except where no bot can reach them or the server's switch lifts the rule.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { fakeTelegramCode } from "@/server/integrations/telegram/login";
import type { Actor } from "@/server/rbac/authorize";
import { firstSignInNeedsTelegram, login } from "@/server/services/auth.service";
import { createStaff } from "@/server/services/staff/staff.service";
import {
  finishStaffTelegramLogin,
  signInOptions,
} from "@/server/services/staff-telegram-login.service";
import {
  finishTelegramLogin,
  safeStaffNext,
  startTelegramLogin,
  stateIsStaff,
} from "@/server/services/student-auth/student-auth.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `st${RUN}`;
const HOST = `${TAG}.example.test`;
const ORIGIN = `https://${HOST}`;
const PASSWORD = "test-password-1";
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
const ctx = { ip: "127.0.0.1", userAgent: "vitest" };

let orgId: string;
let otherOrgId: string;
let branchId: string;
let roleCode: string;
let teacherId: string;
const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: "",
  branchIds: [],
  activeBranchId: null,
};

/** A whole round trip: the start, then Telegram's return with a code naming this phone. */
async function telegramRoundTrip(phoneNo: string | null, as: "staff" | "student" = "staff") {
  const { url, cookie } = await startTelegramLogin(prisma, {
    host: HOST,
    origin: ORIGIN,
    locale: "en",
    next: "/groups",
    ...(as === "staff" ? { kind: "staff" as const } : {}),
  });
  const state = new URL(url).searchParams.get("state");
  const code = fakeTelegramCode({
    id: `7${RUN}${phoneNo ? phoneNo.slice(-2) : "00"}`,
    name: `${TAG} person`,
    ...(phoneNo ? { phone_number: phoneNo.slice(1) } : {}),
  });
  return { host: HOST, origin: ORIGIN, code, state, cookie };
}

beforeAll(async () => {
  process.env.TELEGRAM_LOGIN_FAKE = "1";
  delete process.env.STAFF_PASSWORD_LOGIN;
  const org = await prisma.organization.create({ data: { name: `${TAG} centre`, domain: HOST } });
  orgId = org.id;
  ceo.organizationId = org.id;
  otherOrgId = (await prisma.organization.create({ data: { name: `${TAG} other` } })).id;
  branchId = (await prisma.branch.create({ data: { organizationId: org.id, name: `${TAG} A` } }))
    .id;
  ceo.branchIds = [branchId];
  const otherBranch = await prisma.branch.create({
    data: { organizationId: otherOrgId, name: `${TAG} B` },
  });
  roleCode = `${TAG}_ROLE`.toUpperCase();
  const role = await prisma.role.create({
    data: {
      code: roleCode,
      name: `${TAG} role`,
      permissions: ["groups.view"],
      organizationId: org.id,
    },
  });
  await prisma.integrationSetting.create({
    data: {
      organizationId: org.id,
      provider: "TELEGRAM",
      isEnabled: true,
      config: {
        botToken: `${TAG}:token`,
        botUsername: `${TAG}_bot`,
        webhookSecret: `${TAG}-secret`,
        loginClientId: `1${RUN}`,
        loginClientSecret: `${TAG}-login-secret`,
      },
    },
  });
  const passwordHash = await hashPassword(PASSWORD);
  const make = (n: number, name: string, organizationId: string, branch: string, extra = {}) =>
    prisma.user.create({
      data: {
        organizationId,
        phone: phone(n),
        fullName: `${TAG} ${name}`,
        passwordHash,
        branches: { create: { branchId: branch } },
        ...extra,
      },
    });
  ceo.userId = (await make(1, "CEO", org.id, branchId)).id;
  teacherId = (
    await make(2, "Teacher", org.id, branchId, { roles: { create: { roleId: role.id } } })
  ).id;
  await make(3, "Archived", org.id, branchId, { isArchived: true });
  await make(4, "Elsewhere", otherOrgId, otherBranch.id);
});

afterAll(async () => {
  delete process.env.TELEGRAM_LOGIN_FAKE;
  delete process.env.STAFF_PASSWORD_LOGIN;
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  await prisma.role.deleteMany({ where: { code: roleCode } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
  await prisma.branch.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
});

describe("staff sign-in with Telegram (A-180)", () => {
  it("opens the account whose phone Telegram vouches for, as a Telegram session", async () => {
    const back = await telegramRoundTrip(phone(2));
    expect(stateIsStaff(back.cookie)).toBe(true);
    const done = await finishStaffTelegramLogin(prisma, back, ctx);
    expect(done.issued.session.userId).toBe(teacherId);
    expect(done.issued.session.signedInWith).toBe("TELEGRAM");
    // One branch, so it is the active one, exactly as after a password.
    expect(done.issued.session.activeBranchId).toBe(branchId);
    expect(done.next).toBe("/groups");
    const log = await prisma.loginLog.findFirst({
      where: { userId: teacherId },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toMatchObject({ success: true, method: "TELEGRAM", phone: phone(2) });
    // Telegram has now proven this phone (A-196).
    const proven = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(proven.telegramVerifiedAt).toBeInstanceOf(Date);
  });

  it("refuses a phone no staff member has, an archived one and another centre's", async () => {
    for (const n of [9, 3, 4]) {
      const back = await telegramRoundTrip(phone(n));
      await expect(finishStaffTelegramLogin(prisma, back, ctx)).rejects.toMatchObject({
        message: "errors.staffTelegramUnknown",
      });
    }
    const failed = await prisma.loginLog.findFirst({
      where: { phone: phone(9) },
      orderBy: { createdAt: "desc" },
    });
    expect(failed).toMatchObject({ success: false, method: "TELEGRAM", userId: null });
    expect(await prisma.session.count({ where: { user: { phone: phone(3) } } })).toBe(0);
  });

  it("refuses a Telegram account that shared no phone", async () => {
    const back = await telegramRoundTrip(null);
    await expect(finishStaffTelegramLogin(prisma, back, ctx)).rejects.toMatchObject({
      message: "errors.staffTelegramNoPhone",
    });
  });

  it("keeps staff and student sign-ins apart", async () => {
    // A login started on the student page never opens a staff session…
    const student = await telegramRoundTrip(phone(2), "student");
    expect(stateIsStaff(student.cookie)).toBe(false);
    await expect(finishStaffTelegramLogin(prisma, student, ctx)).rejects.toBeInstanceOf(AppError);
    // …and one started on the staff page never opens a student one.
    const staff = await telegramRoundTrip(phone(2));
    await expect(finishTelegramLogin(prisma, staff, ctx)).rejects.toMatchObject({
      message: "errors.studentLoginExpired",
    });
    // A wrong state is refused before anything is looked up.
    const tampered = await telegramRoundTrip(phone(2));
    await expect(
      finishStaffTelegramLogin(prisma, { ...tampered, state: "other" }, ctx),
    ).rejects.toMatchObject({ message: "errors.studentLoginExpired" });
  });

  it("lands only on pages of the app", () => {
    expect(safeStaffNext("/groups/abc?tab=members")).toBe("/groups/abc?tab=members");
    expect(safeStaffNext("//evil.example")).toBe("");
    expect(safeStaffNext("https://evil.example")).toBe("");
    expect(safeStaffNext("/api/v1/auth/logout")).toBe("");
    expect(safeStaffNext(null)).toBe("");
  });
});

describe("the first sign-in is with Telegram (A-196)", () => {
  it("offers the code and the older Telegram page where the bot is set up", async () => {
    expect(await signInOptions(prisma, HOST)).toMatchObject({
      code: true,
      widget: true,
      bot: { username: `${TAG}_bot`, url: `https://t.me/${TAG}_bot?start=login` },
      brand: { name: `${TAG} centre` },
    });
  });

  it("refuses the right password of someone who has never come in with Telegram", async () => {
    // The CEO of this test has a password and has never used Telegram.
    await expect(login({ phone: phone(1), password: PASSWORD }, ctx)).rejects.toMatchObject({
      message: "errors.firstSignInTelegram",
    });
    expect(await prisma.session.count({ where: { userId: ceo.userId } })).toBe(0);
    // A wrong password says nothing about it.
    await expect(login({ phone: phone(1), password: "wrong-password" }, ctx)).rejects.toMatchObject(
      { message: "errors.invalidCredentials" },
    );
    await prisma.loginAttempt.deleteMany({ where: { key: { contains: phone(1) } } });
  });

  it("takes the password of someone Telegram has vouched for", async () => {
    // The teacher signed in with Telegram in the tests above.
    const outcome = await login({ phone: phone(2), password: PASSWORD }, ctx);
    expect(outcome.kind).toBe("session");
    if (outcome.kind !== "session") return;
    expect(outcome.issued.session.signedInWith).toBe("PASSWORD");
  });

  it("is lifted by the server's switch, and where no bot can send a code", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ceo.userId } });
    expect(await firstSignInNeedsTelegram(prisma, user)).toBe(true);

    process.env.STAFF_PASSWORD_LOGIN = "on";
    try {
      expect(await firstSignInNeedsTelegram(prisma, user)).toBe(false);
      expect((await login({ phone: phone(1), password: PASSWORD }, ctx)).kind).toBe("session");
    } finally {
      delete process.env.STAFF_PASSWORD_LOGIN;
    }
    await expect(login({ phone: phone(1), password: PASSWORD }, ctx)).rejects.toMatchObject({
      message: "errors.firstSignInTelegram",
    });

    // The bot loses its token: nobody could get a code, so the password works.
    const row = await prisma.integrationSetting.findUniqueOrThrow({
      where: { organizationId_provider: { organizationId: orgId, provider: "TELEGRAM" } },
    });
    const config = row.config as Record<string, string>;
    await prisma.integrationSetting.update({
      where: { id: row.id },
      data: { config: { ...config, botToken: "" } },
    });
    expect(await firstSignInNeedsTelegram(prisma, user)).toBe(false);
    expect((await login({ phone: phone(1), password: PASSWORD }, ctx)).kind).toBe("session");
    await prisma.integrationSetting.update({ where: { id: row.id }, data: { config } });

    // A centre with no bot at all is never held to it.
    const elsewhere = await prisma.user.findUniqueOrThrow({ where: { phone: phone(4) } });
    expect(await firstSignInNeedsTelegram(prisma, elsewhere)).toBe(false);
  });

  it("adds staff without a password, who then come in through Telegram", async () => {
    const created = await createStaff(ceo, "staff", {
      fullName: `${TAG} No password`,
      phone: phone(5),
      gender: "FEMALE",
      roleCodes: [roleCode],
      branchIds: [branchId],
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    // Nobody knows the password the account holds, and it is marked as not their own.
    expect(row.mustChangePassword).toBe(true);
    expect(row.telegramVerifiedAt).toBeNull();
    const back = await telegramRoundTrip(phone(5));
    const done = await finishStaffTelegramLogin(prisma, back, ctx);
    expect(done.issued.session.userId).toBe(created.id);
  });
});
