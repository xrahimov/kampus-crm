/**
 * Staff sign-in with Telegram (A-180), against the real database: the phone
 * Telegram vouches for opens the staff account that has it and no other, a
 * centre can refuse passwords only from a Telegram session, and the ways back
 * in (the environment switch, missing login keys) still take a password.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { fakeTelegramCode } from "@/server/integrations/telegram/login";
import type { Actor } from "@/server/rbac/authorize";
import {
  login,
  passwordSignInAllowed,
  telegramOnlyEverywhere,
} from "@/server/services/auth.service";
import { getOrgSettings, updateOrgSettings } from "@/server/services/settings/org-settings.service";
import { createStaff } from "@/server/services/staff/staff.service";
import {
  finishStaffTelegramLogin,
  staffSignInOptions,
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

describe("Telegram only (A-180)", () => {
  const settings = async (staffTelegramOnly: boolean, actor: Actor) => {
    const { organizationId: _o, logoUrl: _l, ...current } = await getOrgSettings(ceo);
    return updateOrgSettings(actor, { ...current, staffTelegramOnly });
  };

  it("offers both ways while passwords are accepted", async () => {
    expect(await staffSignInOptions(prisma, HOST)).toEqual({ telegram: true, password: true });
    expect(await passwordSignInAllowed(prisma, orgId)).toBe(true);
  });

  it("cannot be switched on from a password session", async () => {
    await expect(settings(true, { ...ceo, signedInWith: "PASSWORD" })).rejects.toMatchObject({
      message: "errors.staffTelegramOnlyNeedsTelegram",
    });
    await expect(settings(true, ceo)).rejects.toMatchObject({
      message: "errors.staffTelegramOnlyNeedsTelegram",
    });
    expect((await getOrgSettings(ceo)).staffTelegramOnly).toBe(false);
  });

  it("is switched on from a Telegram session and then refuses the right password", async () => {
    const saved = await settings(true, { ...ceo, signedInWith: "TELEGRAM" });
    expect(saved.staffTelegramOnly).toBe(true);
    expect(await staffSignInOptions(prisma, HOST)).toEqual({ telegram: true, password: false });

    await expect(login({ phone: phone(2), password: PASSWORD }, ctx)).rejects.toMatchObject({
      message: "errors.passwordSignInOff",
    });
    // A wrong password still reads as a wrong password: the answer gives nothing away.
    await expect(login({ phone: phone(2), password: "wrong-password" }, ctx)).rejects.toMatchObject(
      { message: "errors.invalidCredentials" },
    );
    // Telegram still works.
    const done = await finishStaffTelegramLogin(prisma, await telegramRoundTrip(phone(2)), ctx);
    expect(done.issued.session.userId).toBe(teacherId);
    // A save that leaves the switch out keeps it.
    const {
      organizationId: _o,
      logoUrl: _l,
      staffTelegramOnly: _s,
      ...rest
    } = await getOrgSettings(ceo);
    expect((await updateOrgSettings(ceo, rest)).staffTelegramOnly).toBe(true);
  });

  it("adds staff without a password, who then come in through Telegram", async () => {
    const created = await createStaff(ceo, "staff", {
      fullName: `${TAG} Newcomer`,
      phone: phone(5),
      gender: "FEMALE",
      roleCodes: [roleCode],
      branchIds: [branchId],
    });
    const done = await finishStaffTelegramLogin(prisma, await telegramRoundTrip(phone(5)), ctx);
    expect(done.issued.session.userId).toBe(created.id);
  });

  it("takes passwords again with the server's switch or without login keys", async () => {
    process.env.STAFF_PASSWORD_LOGIN = "on";
    expect(await staffSignInOptions(prisma, HOST)).toEqual({ telegram: true, password: true });
    const outcome = await login({ phone: phone(2), password: PASSWORD }, ctx);
    expect(outcome.kind).toBe("session");
    delete process.env.STAFF_PASSWORD_LOGIN;
    await expect(login({ phone: phone(2), password: PASSWORD }, ctx)).rejects.toMatchObject({
      message: "errors.passwordSignInOff",
    });

    // The bot loses its login keys: there is no Telegram to sign in with, so the password works.
    const row = await prisma.integrationSetting.findUniqueOrThrow({
      where: { organizationId_provider: { organizationId: orgId, provider: "TELEGRAM" } },
    });
    const config = row.config as Record<string, string>;
    await prisma.integrationSetting.update({
      where: { id: row.id },
      data: { config: { ...config, loginClientId: "", loginClientSecret: "" } },
    });
    expect(await staffSignInOptions(prisma, HOST)).toEqual({ telegram: false, password: true });
    expect((await login({ phone: phone(2), password: PASSWORD }, ctx)).kind).toBe("session");
    await prisma.integrationSetting.update({ where: { id: row.id }, data: { config } });
  });

  it("can always be switched off, and then a new staff member needs a password", async () => {
    const saved = await settings(false, { ...ceo, signedInWith: "PASSWORD" });
    expect(saved.staffTelegramOnly).toBe(false);
    expect((await login({ phone: phone(2), password: PASSWORD }, ctx)).kind).toBe("session");
    await expect(
      createStaff(ceo, "staff", {
        fullName: `${TAG} No password`,
        phone: phone(6),
        gender: "MALE",
        roleCodes: [roleCode],
        branchIds: [branchId],
      }),
    ).rejects.toMatchObject({ fields: { password: ["validation.required"] } });
  });

  it("is refused where the centre has no Telegram login at all", async () => {
    const actor: Actor = {
      ...ceo,
      organizationId: otherOrgId,
      branchIds: [],
      signedInWith: "TELEGRAM",
    };
    const { organizationId: _o, logoUrl: _l, ...current } = await getOrgSettings(actor);
    await expect(
      updateOrgSettings(actor, { ...current, staffTelegramOnly: true }),
    ).rejects.toMatchObject({ message: "errors.staffTelegramOnlyNoBot" });
  });
});

describe("Telegram only for every centre (A-181)", () => {
  const save = async (actor: Actor, staffTelegramOnlyAll: boolean) => {
    const { organizationId: _o, logoUrl: _l, ...current } = await getOrgSettings(actor);
    return updateOrgSettings(actor, { ...current, staffTelegramOnlyAll });
  };
  const owner = (signedInWith: "PASSWORD" | "TELEGRAM"): Actor => ({
    ...ceo,
    isSiteOwner: true,
    signedInWith,
  });

  it("is dropped when anyone but the site owner saves it", async () => {
    const saved = await save({ ...ceo, signedInWith: "TELEGRAM" }, true);
    expect(saved.staffTelegramOnlyAll).toBe(false);
    expect(saved.canSetStaffTelegramOnlyAll).toBe(false);
    expect(saved.staffTelegramOnly).toBe(false);
  });

  it("cannot be switched on by the site owner from a password session", async () => {
    await expect(save(owner("PASSWORD"), true)).rejects.toMatchObject({
      message: "errors.staffTelegramOnlyNeedsTelegram",
    });
    expect((await getOrgSettings(ceo)).staffTelegramOnlyAll).toBe(false);
  });

  it("covers every centre whose bot has login keys, and only those", async () => {
    // Inside a transaction that is rolled back, so no other test ever sees the rule.
    const rollback = new Error("rollback");
    await prisma
      .$transaction(async (tx) => {
        expect(await telegramOnlyEverywhere(tx)).toBe(false);
        await tx.orgSettings.update({
          where: { organizationId: orgId },
          data: { staffTelegramOnly: true, staffTelegramOnlyAll: true },
        });
        expect(await telegramOnlyEverywhere(tx)).toBe(true);
        expect(await staffSignInOptions(tx, HOST)).toEqual({ telegram: true, password: false });
        expect(await passwordSignInAllowed(tx, orgId)).toBe(false);
        // A centre with no Telegram login keeps its passwords: nobody is locked out.
        expect(await passwordSignInAllowed(tx, otherOrgId)).toBe(true);
        // Once it has the keys, the rule holds there too, without a switch of its own.
        await tx.integrationSetting.create({
          data: {
            organizationId: otherOrgId,
            provider: "TELEGRAM",
            isEnabled: true,
            config: { loginClientId: `2${RUN}`, loginClientSecret: `${TAG}-other-secret` },
          },
        });
        expect(await passwordSignInAllowed(tx, otherOrgId)).toBe(false);
        // The server's switch is still the way back in.
        process.env.STAFF_PASSWORD_LOGIN = "on";
        expect(await passwordSignInAllowed(tx, otherOrgId)).toBe(true);
        expect(await staffSignInOptions(tx, HOST)).toEqual({ telegram: true, password: true });
        delete process.env.STAFF_PASSWORD_LOGIN;
        throw rollback;
      })
      .catch((error: unknown) => {
        delete process.env.STAFF_PASSWORD_LOGIN;
        if (error !== rollback) throw error;
      });
    expect(await passwordSignInAllowed(prisma, orgId)).toBe(true);
  });

  it("is switched on by the site owner from a Telegram session, and off again by anyone's password session", async () => {
    try {
      const saved = await save(owner("TELEGRAM"), true);
      expect(saved).toMatchObject({
        staffTelegramOnlyAll: true,
        staffTelegramOnly: true,
        staffTelegramOnlyServer: true,
        canSetStaffTelegramOnlyAll: true,
      });
      // Another centre's CEO sees the rule but cannot change it.
      const elsewhere: Actor = { ...ceo, organizationId: otherOrgId, branchIds: [] };
      const seen = await getOrgSettings(elsewhere);
      expect(seen).toMatchObject({
        staffTelegramOnlyServer: true,
        staffTelegramOnlyAll: false,
        canSetStaffTelegramOnlyAll: false,
      });
      await expect(login({ phone: phone(2), password: PASSWORD }, ctx)).rejects.toMatchObject({
        message: "errors.passwordSignInOff",
      });
    } finally {
      // Off straight away: the rule is visible to every test that runs beside this one.
      const off = await save(owner("PASSWORD"), false);
      expect(off.staffTelegramOnlyAll).toBe(false);
      expect(off.staffTelegramOnlyServer).toBe(false);
    }
    // The centre's own switch stays as the rule left it until it is switched off too.
    const { organizationId: _o, logoUrl: _l, ...current } = await getOrgSettings(ceo);
    expect(current.staffTelegramOnly).toBe(true);
    await updateOrgSettings(ceo, { ...current, staffTelegramOnly: false });
    expect((await login({ phone: phone(2), password: PASSWORD }, ctx)).kind).toBe("session");
  });
});
