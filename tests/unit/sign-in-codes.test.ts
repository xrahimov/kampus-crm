/**
 * Sign-in with a code from the Telegram bot, the waiting list and passwords
 * (A-196), against the real database. The bot is the test stand-in
 * (TELEGRAM_LOGIN_FAKE=1): it delivers into the fake outbox, and a code is the
 * last six digits of the phone it is for.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { studentCreateSchema } from "@/lib/validation/students";
import { hashPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import { fakeTelegramOutbox } from "@/server/integrations/telegram/notifier";
import type { Actor } from "@/server/rbac/authorize";
import {
  PHONE_CODES_PER_PHONE,
  requestSignInCode,
  verifySignInCode,
} from "@/server/services/sign-in/code.service";
import {
  approveJoinRequest,
  countJoinRequests,
  declineJoinRequest,
  listJoinRequests,
  sendJoinRequest,
} from "@/server/services/sign-in/join-requests.service";
import {
  passwordSignIn,
  setOwnPassword,
  setStudentPassword,
} from "@/server/services/sign-in/password.service";
import { handleBotLogin } from "@/server/services/student-auth/bot-login.service";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";
import { createStudent } from "@/server/services/students/students.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `sc${RUN}`;
const HOST = `${TAG}.example.test`;
const PASSWORD = "test-password-1";
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const codeOf = (n: number) => phone(n).slice(-6);
const tg = (n: number) => `8${RUN}${String(n).padStart(3, "0")}`;
const chat = (n: number) => `c${tg(n)}`;
let ipCounter = 0;
/** A fresh address per call, so one test's wrong codes never lock another's. */
const ctx = () => ({ ip: `10.9.${Number(RUN) % 250}.${(ipCounter += 1)}`, userAgent: "vitest" });

let orgId: string;
let branchA: string;
let branchB: string;
let roleCode: string;
let staffId: string;
const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: "",
  branchIds: [],
  activeBranchId: null,
};

/** The person presses "Share my number" in the bot: Telegram sends their own contact. */
async function shareNumber(n: number, name = `Person ${n}`) {
  return handleBotLogin(
    prisma,
    orgId,
    {
      chatId: chat(n),
      fromId: tg(n),
      firstName: name,
      languageCode: "en",
      contact: { phoneNumber: phone(n).slice(1), userId: tg(n) },
    },
    orgId,
  );
}

const ask = (n: number, door: "STAFF" | "STUDENT" = "STAFF") =>
  requestSignInCode({ phone: phone(n), door, host: HOST }, ctx());

const lastMessageTo = (n: number) =>
  [...fakeTelegramOutbox].reverse().find((m) => m.chatId === chat(n))?.text ?? null;

/** The whole way in for someone the bot already knows: ask, then type the code. */
async function signInWithCode(n: number, door: "STAFF" | "STUDENT" = "STAFF") {
  const ticket = await ask(n, door);
  return verifySignInCode({ id: ticket.id, code: codeOf(n), door, host: HOST }, ctx());
}

beforeAll(async () => {
  process.env.TELEGRAM_LOGIN_FAKE = "1";
  const org = await prisma.organization.create({ data: { name: `${TAG} centre`, domain: HOST } });
  orgId = org.id;
  ceo.organizationId = org.id;
  branchA = (await prisma.branch.create({ data: { organizationId: org.id, name: `${TAG} A` } })).id;
  branchB = (await prisma.branch.create({ data: { organizationId: org.id, name: `${TAG} B` } })).id;
  ceo.branchIds = [branchA, branchB];
  roleCode = `${TAG}_ROLE`.toUpperCase();
  const role = await prisma.role.create({
    data: {
      code: roleCode,
      name: `${TAG} role`,
      permissions: ["groups.view"],
      organizationId: org.id,
    },
  });
  // The role that makes the CEO of this test someone the waiting list tells.
  const boss = await prisma.role.create({
    data: {
      code: `${roleCode}_BOSS`,
      name: `${TAG} boss`,
      permissions: ["students.create", "staff.create"],
      organizationId: org.id,
    },
  });
  await prisma.integrationSetting.create({
    data: {
      organizationId: org.id,
      provider: "TELEGRAM",
      isEnabled: true,
      // No token: the stand-in delivers. The webhook secret is what makes the bot "set up".
      config: { botToken: "", botUsername: `${TAG}_bot`, webhookSecret: `${TAG}-secret` },
    },
  });
  const passwordHash = await hashPassword(PASSWORD);
  const ceoRow = await prisma.user.create({
    data: {
      organizationId: org.id,
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash,
      roles: { create: { roleId: boss.id } },
      branches: { create: [{ branchId: branchA }, { branchId: branchB }] },
    },
  });
  ceo.userId = ceoRow.id;
  // Added by a manager, never signed in: the password it holds is not their own.
  staffId = (
    await prisma.user.create({
      data: {
        organizationId: org.id,
        phone: phone(2),
        fullName: `${TAG} Teacher`,
        passwordHash,
        mustChangePassword: true,
        roles: { create: { roleId: role.id } },
        branches: { create: { branchId: branchA } },
      },
    })
  ).id;
  await prisma.student.create({
    data: { branchId: branchA, fullName: `${TAG} Student`, phone: phone(3), gender: "FEMALE" },
  });
});

afterAll(async () => {
  delete process.env.TELEGRAM_LOGIN_FAKE;
  const phones = { startsWith: `+99895${RUN}` };
  await prisma.joinRequest.deleteMany({ where: { phone: phones } });
  await prisma.phoneSignInCode.deleteMany({ where: { phone: phones } });
  await prisma.telegramContact.deleteMany({ where: { botOrganizationId: orgId } });
  await prisma.loginAttempt.deleteMany({ where: { key: { contains: `+99895${RUN}` } } });
  await prisma.studentAccount.deleteMany({ where: { phone: phones } });
  await prisma.student.deleteMany({ where: { phone: phones } });
  await prisma.user.deleteMany({ where: { phone: phones } });
  await prisma.role.deleteMany({ where: { code: { startsWith: roleCode } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("a code from the bot (A-196)", () => {
  it("is sent only once the person has shared that very number with the bot", async () => {
    const ticket = await ask(2);
    expect(ticket.bot).toEqual({
      username: `${TAG}_bot`,
      url: `https://t.me/${TAG}_bot?start=login`,
    });
    // The bot has never met this person: nothing was sent, and no code opens anything yet.
    expect(lastMessageTo(2)).toBeNull();
    await expect(
      verifySignInCode({ id: ticket.id, code: codeOf(2), door: "STAFF", host: HOST }, ctx()),
    ).rejects.toMatchObject({ message: "errors.signInCodeWrong" });
    await prisma.loginAttempt.deleteMany({ where: { key: { contains: phone(2) } } });

    // Someone else's contact card is not proof of anything.
    const forged = await handleBotLogin(
      prisma,
      orgId,
      {
        chatId: chat(90),
        fromId: tg(90),
        firstName: "Forger",
        languageCode: "en",
        contact: { phoneNumber: phone(2).slice(1), userId: tg(2) },
      },
      orgId,
    );
    expect(forged?.text).toContain("share your own number");
    expect(await prisma.telegramContact.count({ where: { phone: phone(2) } })).toBe(0);

    // Their own number, shared with the button: the code of the waiting sign-in comes at once.
    const reply = await shareNumber(2);
    expect(reply?.text).toContain(codeOf(2));
    expect(reply?.replyMarkup).toEqual({ remove_keyboard: true });
    const contact = await prisma.telegramContact.findFirstOrThrow({ where: { phone: phone(2) } });
    expect(contact).toMatchObject({ telegramUserId: tg(2), chatId: chat(2) });
  });

  it("opens the staff account of that phone as a Telegram session, and offers a password once", async () => {
    const ticket = await prisma.phoneSignInCode.findFirstOrThrow({
      where: { phone: phone(2), usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const done = await verifySignInCode(
      { id: ticket.id, code: codeOf(2), door: "STAFF", host: HOST },
      ctx(),
    );
    expect(done.kind).toBe("staff");
    if (done.kind !== "staff") return;
    expect(done.issued.session).toMatchObject({ userId: staffId, signedInWith: "TELEGRAM" });
    expect(done.offerPassword).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: staffId } });
    expect(row.telegramVerifiedAt).toBeInstanceOf(Date);
    expect(row.passwordOfferedAt).toBeInstanceOf(Date);

    // The same code does not work twice.
    await expect(
      verifySignInCode({ id: ticket.id, code: codeOf(2), door: "STAFF", host: HOST }, ctx()),
    ).rejects.toMatchObject({ message: "errors.signInCodeExpired" });

    // Next time the bot knows the chat: the code arrives without sharing again,
    // and the password is not pushed a second time.
    const again = await ask(2);
    expect(lastMessageTo(2)).toContain(codeOf(2));
    const second = await verifySignInCode(
      { id: again.id, code: codeOf(2), door: "STAFF", host: HOST },
      ctx(),
    );
    expect(second).toMatchObject({ kind: "staff", offerPassword: false });
    // The student page lets a staff member in as staff too: the phone decides, not the page.
    expect((await signInWithCode(2, "STUDENT")).kind).toBe("staff");
  });

  it("counts wrong codes and locks the phone after five", async () => {
    await shareNumber(4, "Guessed");
    const ticket = await ask(4);
    const wrong = codeOf(4) === "000000" ? "000001" : "000000";
    const guessFrom = ctx();
    for (let i = 0; i < 4; i += 1) {
      await expect(
        verifySignInCode({ id: ticket.id, code: wrong, door: "STAFF", host: HOST }, guessFrom),
      ).rejects.toMatchObject({ message: "errors.signInCodeWrong" });
    }
    await expect(
      verifySignInCode({ id: ticket.id, code: wrong, door: "STAFF", host: HOST }, guessFrom),
    ).rejects.toMatchObject({ message: "errors.signInCodeExpired" });
    // Neither the right code nor a new one helps until the lock passes.
    await expect(
      verifySignInCode({ id: ticket.id, code: codeOf(4), door: "STAFF", host: HOST }, ctx()),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(ask(4)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("gives one phone only so many codes in a quarter of an hour", async () => {
    for (let i = 0; i < PHONE_CODES_PER_PHONE; i += 1) await ask(5);
    await expect(ask(5)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "errors.codeTooMany",
    });
  });

  it("is refused on an address where no bot is set up", async () => {
    await prisma.integrationSetting.updateMany({
      where: { organizationId: orgId, provider: "TELEGRAM" },
      data: { isEnabled: false },
    });
    await expect(ask(2)).rejects.toMatchObject({ message: "errors.codeSignInOff" });
    await prisma.integrationSetting.updateMany({
      where: { organizationId: orgId, provider: "TELEGRAM" },
      data: { isEnabled: true },
    });
  });
});

describe("a password after the first sign-in (A-196)", () => {
  it("is chosen by a staff member in a Telegram session only, and then signs them in", async () => {
    const actor: Actor = {
      userId: staffId,
      fullName: "Teacher",
      roles: [roleCode],
      permissions: ["groups.view"],
      organizationId: orgId,
      branchIds: [branchA],
      activeBranchId: branchA,
    };
    const done = await signInWithCode(2);
    if (done.kind !== "staff") throw new Error("expected a staff session");
    const sessionId = done.issued.session.id;

    await expect(
      setOwnPassword({ ...actor, signedInWith: "PASSWORD" }, sessionId, "their-own-pass-1"),
    ).rejects.toMatchObject({ message: "errors.passwordNeedsTelegram" });

    await setOwnPassword({ ...actor, signedInWith: "TELEGRAM" }, sessionId, "their-own-pass-1");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: staffId } });
    expect(row.mustChangePassword).toBe(false);
    // Other devices are signed out; this one stays.
    expect(await prisma.session.count({ where: { userId: staffId } })).toBe(1);

    const withPassword = await passwordSignIn(
      { phone: phone(2), password: "their-own-pass-1", door: "STAFF", scopeOrganizationId: orgId },
      ctx(),
    );
    expect(withPassword.kind).toBe("staff");
    await expect(
      passwordSignIn(
        { phone: phone(2), password: PASSWORD, door: "STAFF", scopeOrganizationId: orgId },
        ctx(),
      ),
    ).rejects.toMatchObject({ message: "errors.invalidCredentials" });
    await prisma.loginAttempt.deleteMany({ where: { key: { contains: phone(2) } } });
  });

  it("works the same for a student: Telegram first, then phone and password", async () => {
    // No password yet: the phone and any password open nothing.
    await expect(
      passwordSignIn(
        { phone: phone(3), password: PASSWORD, door: "STUDENT", scopeOrganizationId: orgId },
        ctx(),
      ),
    ).rejects.toMatchObject({ message: "errors.invalidCredentials" });
    await prisma.loginAttempt.deleteMany({ where: { key: { contains: phone(3) } } });

    const ticket = await ask(3, "STUDENT");
    await shareNumber(3, "Lola");
    const done = await verifySignInCode(
      { id: ticket.id, code: codeOf(3), door: "STUDENT", host: HOST },
      ctx(),
    );
    expect(done).toMatchObject({ kind: "student", offerPassword: true });
    if (done.kind !== "student") return;
    const principal = (await resolveStudentSession(prisma, done.token))!;
    expect(principal).toMatchObject({ signedInWith: "TELEGRAM" });
    expect(principal.account.hasPassword).toBe(false);
    expect(principal.studentIds).toHaveLength(1);

    await setStudentPassword(principal, { newPassword: "student-pass-1" });
    const withPassword = await passwordSignIn(
      { phone: phone(3), password: "student-pass-1", door: "STUDENT", scopeOrganizationId: orgId },
      ctx(),
    );
    expect(withPassword.kind).toBe("student");
    if (withPassword.kind !== "student") return;
    const second = (await resolveStudentSession(prisma, withPassword.token))!;
    expect(second.signedInWith).toBe("PASSWORD");
    expect(second.account.hasPassword).toBe(true);

    // In a password session the current password is asked for.
    await expect(
      setStudentPassword(second, { newPassword: "student-pass-2" }),
    ).rejects.toMatchObject({ fields: { currentPassword: ["validation.wrongPassword"] } });
    await setStudentPassword(second, {
      newPassword: "student-pass-2",
      currentPassword: "student-pass-1",
    });
    // The offer is made once: the next Telegram sign-in goes straight in.
    expect(await signInWithCode(3, "STUDENT")).toMatchObject({
      kind: "student",
      offerPassword: false,
    });
    // On another centre's address this account opens nothing.
    await expect(
      passwordSignIn(
        { phone: phone(3), password: "student-pass-2", door: "STUDENT", scopeOrganizationId: "x" },
        ctx(),
      ),
    ).rejects.toMatchObject({ message: "errors.invalidCredentials" });
    await prisma.loginAttempt.deleteMany({ where: { key: { contains: phone(3) } } });
  });
});

describe("the waiting list (A-196)", () => {
  const outsider: Actor = {
    userId: "",
    fullName: "Outsider",
    roles: [],
    permissions: ["groups.view"],
    organizationId: "",
    branchIds: [],
    activeBranchId: null,
  };

  async function waitingToken(n: number, door: "STAFF" | "STUDENT" = "STUDENT") {
    await shareNumber(n, `Newcomer ${n}`);
    const done = await signInWithCode(n, door);
    if (done.kind !== "waiting" || done.join.state !== "draft") {
      throw new Error(`expected a new request, got ${JSON.stringify(done)}`);
    }
    return done.join;
  }

  it("takes someone whose phone the centre does not have, and asks who they are", async () => {
    outsider.organizationId = orgId;
    outsider.userId = staffId;
    outsider.branchIds = [branchA];
    const join = await waitingToken(10);
    expect(join.fullName).toBe("Newcomer 10");
    expect(join.centres).toHaveLength(1);
    expect(join.centres[0]!.branches.map((b) => b.id).sort()).toEqual([branchA, branchB].sort());
    // Nothing reaches the staff until the person has said where they belong.
    expect(await countJoinRequests(ceo)).toBe(0);

    await expect(
      sendJoinRequest(prisma, { token: join.token, fullName: "Dilnoza Karimova", note: "" }, orgId),
    ).rejects.toMatchObject({ fields: { branchId: ["validation.required"] } });
    const sent = await sendJoinRequest(
      prisma,
      { token: join.token, fullName: "Dilnoza Karimova", branchId: branchA, note: "Deutsch A1" },
      orgId,
    );
    expect(sent).toEqual({ state: "sent", centre: `${TAG} centre` });
    // The token is spent.
    await expect(
      sendJoinRequest(
        prisma,
        { token: join.token, fullName: "Again", branchId: branchA, note: "" },
        orgId,
      ),
    ).rejects.toMatchObject({ message: "errors.joinRequestExpired" });

    expect(await countJoinRequests(ceo)).toBe(1);
    const list = await listJoinRequests(ceo, "PENDING");
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      phone: phone(10),
      fullName: "Dilnoza Karimova",
      note: "Deutsch A1",
      door: "STUDENT",
      branchId: branchA,
    });
    // The CEO was told in the app.
    expect(
      await prisma.notification.count({ where: { userId: ceo.userId, kind: "JOIN_REQUEST" } }),
    ).toBe(1);
    // Someone who can add neither students nor staff sees no requests.
    expect(await countJoinRequests(outsider)).toBe(0);
    await expect(listJoinRequests(outsider, "PENDING")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Signing in again while waiting says so, and makes no second request.
    expect(await signInWithCode(10, "STUDENT")).toEqual({
      kind: "waiting",
      join: { state: "sent", centre: `${TAG} centre` },
    });
    expect(await countJoinRequests(ceo)).toBe(1);
  });

  it("can be declined, with word sent to the person, and still approved later", async () => {
    const [request] = (await listJoinRequests(ceo, "PENDING")).items;
    await declineJoinRequest(ceo, request!.id);
    expect(lastMessageTo(10)).toContain("declined");
    await expect(declineJoinRequest(ceo, request!.id)).rejects.toMatchObject({
      message: "errors.joinRequestDecided",
    });
    expect(await signInWithCode(10, "STUDENT")).toEqual({
      kind: "waiting",
      join: { state: "declined", centre: `${TAG} centre` },
    });
    expect((await listJoinRequests(ceo, "DECLINED")).items[0]).toMatchObject({
      id: request!.id,
      decidedByName: `${TAG} CEO`,
    });

    // A student request cannot be let in as staff.
    await expect(
      approveJoinRequest(ceo, request!.id, {
        mode: "newStaff",
        fullName: "Dilnoza Karimova",
        branchId: branchA,
        gender: "FEMALE",
        roleCode,
      }),
    ).rejects.toMatchObject({ fields: { mode: ["validation.joinRequestMode"] } });

    await approveJoinRequest(ceo, request!.id, {
      mode: "newStudent",
      fullName: "Dilnoza Karimova",
      branchId: branchA,
      gender: "FEMALE",
    });
    const student = await prisma.student.findFirstOrThrow({ where: { phone: phone(10) } });
    expect(student).toMatchObject({ fullName: "Dilnoza Karimova", branchId: branchA });
    const row = await prisma.joinRequest.findUniqueOrThrow({ where: { id: request!.id } });
    expect(row).toMatchObject({ status: "APPROVED", decidedById: ceo.userId });
    expect(lastMessageTo(10)).toContain("let you in");
    expect(lastMessageTo(10)).toContain(`/en/student/login`);
    // Now the same phone signs in.
    expect((await signInWithCode(10, "STUDENT")).kind).toBe("student");
  });

  it("lets a parent in on an existing student's card", async () => {
    const join = await waitingToken(11);
    await sendJoinRequest(
      prisma,
      { token: join.token, fullName: "Parent Eleven", branchId: branchA, note: "" },
      orgId,
    );
    const [request] = (await listJoinRequests(ceo, "PENDING")).items;
    const child = await prisma.student.findFirstOrThrow({ where: { phone: phone(3) } });
    await approveJoinRequest(ceo, request!.id, {
      mode: "parent",
      studentId: child.id,
      fullName: "Parent Eleven",
    });
    expect(await prisma.parent.count({ where: { studentId: child.id, phone: phone(11) } })).toBe(1);
    const done = await signInWithCode(11, "STUDENT");
    expect(done.kind).toBe("student");
    if (done.kind !== "student") return;
    const principal = (await resolveStudentSession(prisma, done.token))!;
    expect(principal.childIds).toEqual([child.id]);
  });

  it("closes by itself when the phone is added anywhere else in the app", async () => {
    const join = await waitingToken(12);
    await sendJoinRequest(
      prisma,
      { token: join.token, fullName: "Self Closing", branchId: branchB, note: "" },
      orgId,
    );
    expect(await countJoinRequests(ceo)).toBe(1);
    await createStudent(
      ceo,
      studentCreateSchema.parse({
        branchId: branchB,
        fullName: "Self Closing",
        phone: phone(12),
        gender: "MALE",
      }),
    );
    expect(await countJoinRequests(ceo)).toBe(0);
    const row = await prisma.joinRequest.findFirstOrThrow({ where: { phone: phone(12) } });
    expect(row).toMatchObject({ status: "APPROVED", decidedById: ceo.userId });
    expect(lastMessageTo(12)).toContain("let you in");
  });

  it("lets a new staff member in from the staff page, with no password to hand over", async () => {
    const join = await waitingToken(13, "STAFF");
    await sendJoinRequest(
      prisma,
      { token: join.token, fullName: "New Teacher", branchId: branchA, note: "" },
      orgId,
    );
    const [request] = (await listJoinRequests(ceo, "PENDING")).items;
    expect(request).toMatchObject({ door: "STAFF", phone: phone(13) });
    await expect(
      approveJoinRequest(ceo, request!.id, {
        mode: "newStudent",
        fullName: "New Teacher",
        branchId: branchA,
        gender: "MALE",
      }),
    ).rejects.toMatchObject({ fields: { mode: ["validation.joinRequestMode"] } });
    await approveJoinRequest(ceo, request!.id, {
      mode: "newStaff",
      fullName: "New Teacher",
      branchId: branchA,
      gender: "MALE",
      roleCode,
    });
    expect(lastMessageTo(13)).toContain("/en/login");
    const done = await signInWithCode(13);
    // Telegram has proven the phone, and the password is theirs to choose.
    expect(done).toMatchObject({ kind: "staff", offerPassword: true });
  });
});
