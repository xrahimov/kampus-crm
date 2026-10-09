/**
 * Integration tests against the real database (DATABASE_URL).
 * Each test uses its own phone numbers so runs do not interfere.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { findSessionByToken } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { login, logout, setActiveBranch } from "@/server/services/auth.service";

/** The tests here sign in without a Telegram code: the outcome is always a session. */
async function signIn(input: Parameters<typeof login>[0], ctx: Parameters<typeof login>[1]) {
  const outcome = await login(input, ctx);
  if (outcome.kind !== "session") throw new Error("expected a session, got a challenge");
  return outcome.issued;
}

const PHONE = "+998901110001";
const LOCKED_PHONE = "+998901110002";
const PASSWORD = "test-password-1";

let orgId: string;
let branchA: string;
let branchB: string;
let userId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: "Test Org" } });
  orgId = org.id;
  branchA = (await prisma.branch.create({ data: { organizationId: org.id, name: "A" } })).id;
  branchB = (await prisma.branch.create({ data: { organizationId: org.id, name: "B" } })).id;
  const role = await prisma.role.upsert({
    where: { code: "TEST_ROLE" },
    update: { permissions: ["groups.view"] },
    create: { code: "TEST_ROLE", name: "Test role", permissions: ["groups.view"] },
  });
  const passwordHash = await hashPassword(PASSWORD);
  for (const phone of [PHONE, LOCKED_PHONE]) {
    await prisma.user.deleteMany({ where: { phone } });
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        phone,
        fullName: `User ${phone}`,
        passwordHash,
        roles: { create: { roleId: role.id } },
        branches: { create: { branchId: branchA } },
      },
    });
    if (phone === PHONE) userId = user.id;
  }
  await prisma.loginAttempt.deleteMany({});
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { phone: { in: [PHONE, LOCKED_PHONE] } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("login", () => {
  it("issues a session whose token hash is stored and resolves back to the user", async () => {
    const issued = await signIn({ phone: PHONE, password: PASSWORD }, { ip: "10.0.0.1" });
    expect(issued.token).toHaveLength(43);
    expect(issued.session.activeBranchId).toBe(branchA); // single branch → preselected

    const stored = await prisma.session.findUnique({ where: { id: issued.session.id } });
    expect(stored?.tokenHash).not.toBe(issued.token);

    const found = await findSessionByToken(prisma, issued.token);
    expect(found?.userId).toBe(userId);

    const log = await prisma.loginLog.findFirst({ where: { phone: PHONE, success: true } });
    expect(log).not.toBeNull();
  });

  it("rejects a wrong password with UNAUTHENTICATED and logs the failure", async () => {
    await expect(
      login({ phone: PHONE, password: "wrong-password" }, { ip: "10.0.0.2" }),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const log = await prisma.loginLog.findFirst({ where: { phone: PHONE, success: false } });
    expect(log).not.toBeNull();
  });

  it("gives the same error for an unknown phone", async () => {
    await expect(
      login({ phone: "+998909999999", password: PASSWORD }, { ip: "10.0.0.3" }),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("locks the phone after five failures, even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        login({ phone: LOCKED_PHONE, password: "bad" }, { ip: `10.1.0.${i}` }),
      ).rejects.toBeInstanceOf(AppError);
    }
    let caught: unknown;
    try {
      await login({ phone: LOCKED_PHONE, password: PASSWORD }, { ip: "10.1.0.99" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("RATE_LIMITED");
    expect((caught as AppError).meta?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("expired sessions are not returned", async () => {
    const issued = await signIn({ phone: PHONE, password: PASSWORD }, { ip: "10.0.0.4" });
    await prisma.session.update({
      where: { id: issued.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await findSessionByToken(prisma, issued.token)).toBeNull();
  });

  it("logout revokes the session", async () => {
    const issued = await signIn({ phone: PHONE, password: PASSWORD }, { ip: "10.0.0.5" });
    await logout(issued.session.id);
    expect(await findSessionByToken(prisma, issued.token)).toBeNull();
  });
});

describe("setActiveBranch", () => {
  const actor = () => ({
    userId,
    fullName: "x",
    organizationId: orgId,
    roles: ["TEST_ROLE"],
    permissions: ["groups.view"],
    branchIds: [branchA],
    activeBranchId: null,
  });

  it("allows one of the user's branches and rejects others or 'all'", async () => {
    const issued = await signIn({ phone: PHONE, password: PASSWORD }, { ip: "10.0.0.6" });
    await setActiveBranch(actor(), issued.session.id, branchA);
    await expect(setActiveBranch(actor(), issued.session.id, branchB)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setActiveBranch(actor(), issued.session.id, null)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setActiveBranch(actor(), issued.session.id, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lets an org-wide actor pick any branch or all", async () => {
    const issued = await signIn({ phone: PHONE, password: PASSWORD }, { ip: "10.0.0.7" });
    const ceo = { ...actor(), permissions: ["*"], branchIds: [branchA, branchB] };
    await setActiveBranch(ceo, issued.session.id, branchB);
    await setActiveBranch(ceo, issued.session.id, null);
    const session = await prisma.session.findUnique({ where: { id: issued.session.id } });
    expect(session?.activeBranchId).toBeNull();
  });
});
