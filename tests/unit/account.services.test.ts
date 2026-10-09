/**
 * Account safety (A-124) against the real database: temporary passwords, the
 * Telegram sign-in code, sign-in alerts and the administrator's switches.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { findSessionByToken } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { fakeTelegramOutbox } from "@/server/integrations/telegram/notifier";
import type { Actor } from "@/server/rbac/authorize";
import {
  changePassword,
  getAccount,
  listOwnSessions,
  revokeOtherSessions,
  setOwnSignInCode,
} from "@/server/services/account.service";
import { login, verifySignInCode } from "@/server/services/auth.service";
import { createStaff, signOutEverywhere, updateStaff } from "@/server/services/staff/staff.service";

const RUN = String(Date.now()).slice(-7);
const TAG = `acct${RUN}`;
const phone = (n: number) => `+9989${RUN}${n}`;
const PASSWORD = "first-password-1";
const OWN_PASSWORD = "my-own-password-2";

let orgId: string;
let branchId: string;
let roleCode: string;
let ownerId: string;
let cashierId: string;
let managerId: string;

const actorFor = (userId: string, permissions: string[]): Actor => ({
  userId,
  fullName: "x",
  organizationId: orgId,
  roles: [roleCode],
  permissions,
  branchIds: [branchId],
  activeBranchId: branchId,
});

async function session(phoneNumber: string, password: string, ctx = { ip: "10.5.0.1" }) {
  const outcome = await login({ phone: phoneNumber, password }, ctx);
  if (outcome.kind !== "session") throw new Error("expected a session");
  return outcome.issued;
}

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `${TAG} Org` } });
  orgId = org.id;
  branchId = (await prisma.branch.create({ data: { organizationId: orgId, name: `${TAG} B` } })).id;
  roleCode = `${TAG}_ROLE`;
  await prisma.role.create({
    data: { organizationId: orgId, code: roleCode, name: "Role", permissions: ["groups.view"] },
  });
  const passwordHash = await hashPassword(PASSWORD);
  const make = async (n: number, name: string, data: Record<string, unknown> = {}) =>
    (
      await prisma.user.create({
        data: {
          organizationId: orgId,
          phone: phone(n),
          fullName: `${TAG} ${name}`,
          passwordHash,
          branches: { create: { branchId } },
          ...data,
        },
      })
    ).id;
  ownerId = await make(1, "Owner");
  cashierId = await make(2, "Cashier", { mustChangePassword: true });
  managerId = await make(3, "Manager");
  await prisma.botRecipient.create({
    data: { organizationId: orgId, userId: managerId, chatId: `${TAG}-manager-chat` },
  });
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { payload: { path: ["organizationId"], equals: orgId } } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.role.deleteMany({ where: { code: roleCode } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("account safety (A-124)", () => {
  it("a password someone else chose is used once, and changing it ends the other sessions", async () => {
    const first = await session(phone(2), PASSWORD, { ip: "10.5.0.2" });
    const second = await session(phone(2), PASSWORD, { ip: "10.5.0.3" });
    const actor = actorFor(cashierId, ["groups.view"]);
    expect((await getAccount(actor)).mustChangePassword).toBe(true);

    await expect(
      changePassword(actor, second.session.id, {
        currentPassword: "not-the-password",
        newPassword: OWN_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      changePassword(actor, second.session.id, {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await changePassword(actor, second.session.id, {
      currentPassword: PASSWORD,
      newPassword: OWN_PASSWORD,
    });
    const account = await getAccount(actor);
    expect(account.mustChangePassword).toBe(false);
    expect(account.passwordChangedAt).not.toBeNull();
    expect(await findSessionByToken(prisma, first.token)).toBeNull();
    expect(await findSessionByToken(prisma, second.token)).not.toBeNull();
    await expect(
      login({ phone: phone(2), password: PASSWORD }, { ip: "10.5.0.4" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await session(phone(2), OWN_PASSWORD, { ip: "10.5.0.4" });

    // The devices list knows which session this is, and "everywhere else" spares it.
    const mine = await listOwnSessions(actor, second.session.id);
    expect(mine.filter((s) => s.current)).toHaveLength(1);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(await revokeOtherSessions(actor, second.session.id)).toBe(mine.length - 1);
    expect(await listOwnSessions(actor, second.session.id)).toHaveLength(1);
  });

  it("asks for a Telegram code after the password once the switch is on", async () => {
    const actor = actorFor(cashierId, ["groups.view"]);
    await expect(setOwnSignInCode(actor, "TELEGRAM")).rejects.toMatchObject({ code: "VALIDATION" });
    const chat = `${TAG}-cashier-chat`;
    await prisma.botRecipient.create({
      data: { organizationId: orgId, userId: cashierId, chatId: chat },
    });
    const account = await setOwnSignInCode(actor, "TELEGRAM");
    expect(account).toMatchObject({ signInCode: "TELEGRAM", telegramLinked: true });

    const outcome = await login({ phone: phone(2), password: OWN_PASSWORD }, { ip: "10.5.0.5" });
    expect(outcome.kind).toBe("challenge");
    if (outcome.kind !== "challenge") return;
    const sent = [...fakeTelegramOutbox].reverse().find((m) => m.chatId === chat);
    const code = sent?.text.match(/\d{6}/)?.[0];
    expect(code).toBeDefined();
    expect(await prisma.session.count({ where: { userId: cashierId, ip: "10.5.0.5" } })).toBe(0);

    const wrong = code === "000000" ? "000001" : "000000";
    await expect(
      verifySignInCode({ challengeId: outcome.challengeId, code: wrong }, { ip: "10.5.0.5" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "errors.signInCodeWrong" });
    expect(
      (await prisma.loginChallenge.findUnique({ where: { id: outcome.challengeId } }))?.attempts,
    ).toBe(1);

    const issued = await verifySignInCode(
      { challengeId: outcome.challengeId, code: code! },
      { ip: "10.5.0.5", userAgent: "Vitest" },
    );
    expect((await findSessionByToken(prisma, issued.token))?.userId).toBe(cashierId);
    expect(
      await prisma.loginChallenge.findUnique({ where: { id: outcome.challengeId } }),
    ).toBeNull();
    expect(
      await prisma.loginLog.count({ where: { userId: cashierId, success: true, ip: "10.5.0.5" } }),
    ).toBe(1);

    // A code is good for five minutes and five tries.
    const stale = await login({ phone: phone(2), password: OWN_PASSWORD }, { ip: "10.5.0.6" });
    if (stale.kind !== "challenge") throw new Error("expected a challenge");
    await prisma.loginChallenge.update({
      where: { id: stale.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      verifySignInCode({ challengeId: stale.challengeId, code: "123456" }, { ip: "10.5.0.6" }),
    ).rejects.toMatchObject({ message: "errors.signInCodeExpired" });

    const guessed = await login({ phone: phone(2), password: OWN_PASSWORD }, { ip: "10.5.0.7" });
    if (guessed.kind !== "challenge") throw new Error("expected a challenge");
    const real = [...fakeTelegramOutbox]
      .reverse()
      .find((m) => m.chatId === chat)
      ?.text.match(/\d{6}/)?.[0];
    const guess = real === "111111" ? "222222" : "111111";
    for (let i = 0; i < 4; i++) {
      await expect(
        verifySignInCode({ challengeId: guessed.challengeId, code: guess }, { ip: "10.5.0.7" }),
      ).rejects.toMatchObject({ message: "errors.signInCodeWrong" });
    }
    await expect(
      verifySignInCode({ challengeId: guessed.challengeId, code: guess }, { ip: "10.5.0.7" }),
    ).rejects.toMatchObject({ message: "errors.signInCodeExpired" });
    expect(
      await prisma.loginChallenge.findUnique({ where: { id: guessed.challengeId } }),
    ).toBeNull();
    // The right code no longer works either: the challenge is gone.
    await expect(
      verifySignInCode({ challengeId: guessed.challengeId, code: real! }, { ip: "10.5.0.7" }),
    ).rejects.toMatchObject({ message: "errors.signInCodeExpired" });

    await setOwnSignInCode(actor, "OFF");
    await session(phone(2), OWN_PASSWORD, { ip: "10.5.0.8" });
  });

  it("reports a sign-in from a new browser or address to the person's Telegram", async () => {
    const chat = `${TAG}-manager-chat`;
    const alerts = () =>
      prisma.job.count({
        where: { type: "telegram.send", payload: { path: ["chatId"], equals: chat } },
      });
    const before = await alerts();
    await session(phone(3), PASSWORD, { ip: "10.5.1.1", userAgent: "Vitest/1 (Linux)" } as never);
    expect(await alerts()).toBe(before + 1);
    const job = await prisma.job.findFirst({
      where: { type: "telegram.send", payload: { path: ["chatId"], equals: chat } },
      orderBy: { createdAt: "desc" },
    });
    expect((job?.payload as { text: string }).text).toContain(`${TAG} Manager`);
    // The same browser from the same address is known; another browser is not.
    await session(phone(3), PASSWORD, { ip: "10.5.1.1", userAgent: "Vitest/1 (Linux)" } as never);
    expect(await alerts()).toBe(before + 1);
    await session(phone(3), PASSWORD, { ip: "10.5.1.1", userAgent: "Vitest/2 (Android)" } as never);
    expect(await alerts()).toBe(before + 2);
  });

  it("lets an administrator reset a password, switch the code and sign a person out everywhere", async () => {
    const owner = actorFor(ownerId, ["*"]);
    const created = await createStaff(owner, "staff", {
      fullName: `${TAG} Newcomer`,
      phone: phone(4),
      gender: "MALE",
      roleCodes: [roleCode],
      branchIds: [branchId],
      password: PASSWORD,
    });
    expect(created).toMatchObject({
      mustChangePassword: true,
      signInCode: "OFF",
      telegramLinked: false,
    });

    const theirs = await session(phone(4), PASSWORD, { ip: "10.5.2.1" });
    const reset = await updateStaff(owner, "staff", created.id, { password: "reset-by-admin-3" });
    expect(reset.mustChangePassword).toBe(true);
    expect(await findSessionByToken(prisma, theirs.token)).toBeNull();
    await expect(
      login({ phone: phone(4), password: PASSWORD }, { ip: "10.5.2.2" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await expect(
      updateStaff(owner, "staff", created.id, { signInCode: "TELEGRAM" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await prisma.botRecipient.create({
      data: { organizationId: orgId, userId: created.id, chatId: `${TAG}-new-chat` },
    });
    const switched = await updateStaff(owner, "staff", created.id, { signInCode: "TELEGRAM" });
    expect(switched).toMatchObject({ signInCode: "TELEGRAM", telegramLinked: true });

    await updateStaff(owner, "staff", created.id, { signInCode: "OFF" });
    const a = await session(phone(4), "reset-by-admin-3", { ip: "10.5.2.3" });
    const b = await session(phone(4), "reset-by-admin-3", { ip: "10.5.2.4" });
    expect(await signOutEverywhere(owner, "staff", created.id)).toBe(2);
    expect(await findSessionByToken(prisma, a.token)).toBeNull();
    expect(await findSessionByToken(prisma, b.token)).toBeNull();
    // The person's own new password is final.
    const own = await session(phone(4), "reset-by-admin-3", { ip: "10.5.2.5" });
    await changePassword(actorFor(created.id, ["groups.view"]), own.session.id, {
      currentPassword: "reset-by-admin-3",
      newPassword: OWN_PASSWORD,
    });
    expect((await getAccount(actorFor(created.id, ["groups.view"]))).mustChangePassword).toBe(
      false,
    );
  });
});
