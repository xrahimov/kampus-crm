/**
 * Student and parent sign-in with Telegram (A-150), against the real database:
 * no account without a matching phone, links per student and parent, one
 * account per student, sessions, one-time bot links, the bot's contact flow,
 * code linking from the student's page and staff unlinking.
 */
import { generateKeyPairSync, sign } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import {
  checkClaims,
  fakeTelegramCode,
  identityFromClaims,
  verifyIdToken,
} from "@/server/integrations/telegram/login";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  listStudentAccess,
  signOutStudentAccess,
  unlinkStudentAccess,
} from "@/server/services/student-auth/access.service";
import { handleBotLogin } from "@/server/services/student-auth/bot-login.service";
import {
  accountForIdentity,
  createStudentSession,
  issueLoginTicket,
  phoneFromTelegram,
  redeemLoginTicket,
  resolveStudentSession,
  safeNext,
} from "@/server/services/student-auth/student-auth.service";
import { getStudentHome } from "@/server/services/student-auth/student-home.service";
import { handleStudentCommand } from "@/server/services/telegram/student-telegram.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `sa${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
const digits = (n: number) => phone(n).slice(1);
const tg = (n: number) => `9${RUN}${String(n).padStart(3, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let groupId: string;
let ali: string;
let vali: string;
let parentOfVali: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} English`,
      description: undefined,
      price: 300_000,
      durationMonths: 24,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} B1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const member = (name: string, n: number) =>
    addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
  ali = (await member("Ali", 11)).studentId;
  vali = (await member("Vali", 12)).studentId;
  parentOfVali = (
    await prisma.parent.create({
      data: { studentId: vali, fullName: `${TAG} Mum`, phone: phone(21) },
    })
  ).id;
});

afterAll(async () => {
  await prisma.studentAccount.deleteMany({ where: { telegramUserId: { startsWith: `9${RUN}` } } });
});

const identity = (n: number, phoneNo: string | null) => ({
  telegramUserId: tg(n),
  name: `${TAG} TG ${n}`,
  username: `${TAG}_${n}`,
  photoUrl: null,
  phone: phoneNo,
});

describe("Telegram ID token checks (A-150)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256" };
  const now = Math.floor(Date.now() / 1000);
  const token = (claims: Record<string, unknown>, kid = "k1") => {
    const h = Buffer.from(JSON.stringify({ alg: "RS256", kid })).toString("base64url");
    const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const s = sign("sha256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");
    return `${h}.${p}.${s}`;
  };
  const claims = {
    iss: "https://oauth.telegram.org",
    aud: "123456",
    sub: "abc",
    iat: now,
    exp: now + 3600,
    id: 987654321,
    name: "Ali Valiyev",
    preferred_username: "ali",
    phone_number: "998901234567",
    phone_number_verified: true,
  };

  it("accepts a token signed by Telegram's key and reads the identity", async () => {
    const decoded = await verifyIdToken(token(claims), async () => [jwk]);
    checkClaims(decoded, { clientId: "123456", nonce: "n" }, now);
    expect(identityFromClaims(decoded)).toEqual({
      telegramUserId: "987654321",
      name: "Ali Valiyev",
      username: "ali",
      photoUrl: null,
      phone: "998901234567",
    });
  });

  it("refuses a tampered token, a foreign audience, an old token and a wrong nonce", async () => {
    const good = token(claims);
    const [h, , s] = good.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, id: 1 })).toString("base64url")}.${s}`;
    await expect(verifyIdToken(forged, async () => [jwk])).rejects.toThrow(/bad signature/);
    await expect(verifyIdToken(token(claims, "other"), async () => [jwk])).rejects.toThrow(/key/);
    expect(() =>
      checkClaims({ ...claims, aud: "999" }, { clientId: "123456", nonce: "n" }, now),
    ).toThrow(/audience/);
    expect(() =>
      checkClaims(
        { ...claims, iat: now - 3600, exp: now + 60 },
        { clientId: "123456", nonce: "n" },
        now,
      ),
    ).toThrow(/too old/);
    expect(() =>
      checkClaims({ ...claims, nonce: "x" }, { clientId: "123456", nonce: "n" }, now),
    ).toThrow(/nonce/);
    expect(() =>
      checkClaims({ ...claims, iss: "https://evil" }, { clientId: "123456", nonce: "n" }, now),
    ).toThrow(/issuer/);
  });

  it("drops an unverified phone and keeps only digits", () => {
    expect(identityFromClaims({ ...claims, phone_number_verified: false }).phone).toBeNull();
    expect(identityFromClaims({ ...claims, phone_number: "+998 90 123-45-67" }).phone).toBe(
      "998901234567",
    );
    expect(phoneFromTelegram("998901234567")).toBe("+998901234567");
    expect(phoneFromTelegram(null)).toBeNull();
    expect(fakeTelegramCode({ id: 1 })).toMatch(/^fake\./);
  });

  it("lands only inside the student area after sign-in", () => {
    expect(safeNext("/en/student")).toBe("/en/student");
    expect(safeNext("https://evil.example")).toBe("");
    expect(safeNext("//evil.example/student")).toBe("");
    expect(safeNext("/en/students/123")).toBe("");
  });
});

describe("accounts and links (A-150)", () => {
  it("creates nothing for a phone the centre does not have", async () => {
    await expect(
      prisma.$transaction((tx) => accountForIdentity(tx, identity(1, "998000000000"), null)),
    ).rejects.toMatchObject({ message: "errors.studentNotRegistered" });
    await expect(
      prisma.studentAccount.findUnique({ where: { telegramUserId: tg(1) } }),
    ).resolves.toBeNull();
  });

  it("links the student whose phone Telegram verified, and only in the scoped centre", async () => {
    await expect(
      prisma.$transaction((tx) => accountForIdentity(tx, identity(2, digits(11)), "org_elsewhere")),
    ).rejects.toMatchObject({ message: "errors.studentNotRegistered" });
    const account = await prisma.$transaction((tx) =>
      accountForIdentity(tx, identity(2, digits(11)), DEMO_ORG_ID),
    );
    const links = await prisma.studentAccountLink.findMany({ where: { accountId: account.id } });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ studentId: ali, via: "PHONE", organizationId: DEMO_ORG_ID });
    // Signing in again changes nothing but the profile details.
    await prisma.$transaction((tx) => accountForIdentity(tx, identity(2, digits(11)), null));
    expect(await prisma.studentAccountLink.count({ where: { accountId: account.id } })).toBe(1);
  });

  it("keeps one Telegram account per student", async () => {
    await expect(
      prisma.$transaction((tx) => accountForIdentity(tx, identity(3, digits(11)), null)),
    ).rejects.toMatchObject({ message: "errors.studentLinkedElsewhere" });
  });

  it("links a parent by the parent's phone and shows the child at home", async () => {
    const account = await prisma.$transaction((tx) =>
      accountForIdentity(tx, identity(4, digits(21)), null),
    );
    const token = await createStudentSession(prisma, account.id, {});
    const principal = await resolveStudentSession(prisma, token);
    expect(principal).toMatchObject({ studentIds: [], childIds: [vali] });
    const home = await getStudentHome(principal!);
    expect(home.profiles).toHaveLength(1);
    expect(home.profiles[0]).toMatchObject({ studentId: vali, relation: "CHILD" });
    expect(home.profiles[0]!.groups[0]).toMatchObject({ groupName: `${TAG} B1`, live: false });
  });
});

describe("sessions and the bot (A-150)", () => {
  it("a session opens the student's home and dies with the student's archive", async () => {
    const account = await prisma.studentAccount.findUniqueOrThrow({
      where: { telegramUserId: tg(2) },
    });
    const token = await createStudentSession(prisma, account.id, { ip: "10.0.0.1" });
    const principal = await resolveStudentSession(prisma, token);
    expect(principal!.studentIds).toEqual([ali]);
    const home = await getStudentHome(principal!);
    expect(home.profiles[0]).toMatchObject({ studentId: ali, relation: "SELF" });
    await prisma.student.update({ where: { id: ali }, data: { isArchived: true } });
    await expect(resolveStudentSession(prisma, token)).resolves.toBeNull();
    await prisma.student.update({ where: { id: ali }, data: { isArchived: false } });
    await expect(resolveStudentSession(prisma, "nope")).resolves.toBeNull();
  });

  it("a bot sign-in link works once", async () => {
    const account = await prisma.studentAccount.findUniqueOrThrow({
      where: { telegramUserId: tg(2) },
    });
    const ticket = await issueLoginTicket(prisma, account.id);
    const token = await redeemLoginTicket(prisma, ticket, {});
    await expect(resolveStudentSession(prisma, token)).resolves.not.toBeNull();
    await expect(redeemLoginTicket(prisma, ticket, {})).rejects.toMatchObject({
      message: "errors.studentLinkExpired",
    });
    const old = await issueLoginTicket(prisma, account.id, new Date(Date.now() - 11 * 60_000));
    await expect(redeemLoginTicket(prisma, old, {})).rejects.toMatchObject({
      message: "errors.studentLinkExpired",
    });
  });

  it("the bot asks for the number, refuses someone else's contact and sends a link for a match", async () => {
    const ask = await handleBotLogin(prisma, null, {
      chatId: tg(5),
      text: "/start login",
      languageCode: "en",
    });
    expect(ask!.replyMarkup).toMatchObject({ keyboard: [[{ request_contact: true }]] });
    const foreign = await handleBotLogin(prisma, null, {
      chatId: tg(5),
      fromId: tg(5),
      languageCode: "en",
      contact: { phoneNumber: digits(12), userId: tg(6) },
    });
    expect(foreign!.text).toMatch(/your own number/);
    const unknown = await handleBotLogin(prisma, null, {
      chatId: tg(5),
      fromId: tg(5),
      languageCode: "en",
      contact: { phoneNumber: "998000000001", userId: tg(5) },
    });
    expect(unknown!.text).toMatch(/not registered/);
    const ok = await handleBotLogin(prisma, DEMO_ORG_ID, {
      chatId: tg(5),
      fromId: tg(5),
      firstName: "Vali",
      languageCode: "en",
      contact: { phoneNumber: `+${digits(12)}`, userId: tg(5) },
    });
    const url = ok!.text.match(/https?:\/\/\S+/)![0];
    expect(url).toMatch(/\/api\/v1\/student-auth\/enter\/[A-Za-z0-9_-]+\?locale=en$/);
    const ticket = url.split("/enter/")[1]!.split("?")[0]!;
    const principal = await resolveStudentSession(
      prisma,
      await redeemLoginTicket(prisma, ticket, {}),
    );
    expect(principal!.studentIds).toEqual([vali]);
    // The chat now hears about Vali's lessons too.
    await expect(
      prisma.studentTelegramChat.findUnique({ where: { chatId: tg(5) } }),
    ).resolves.toMatchObject({
      studentId: vali,
    });
  });

  it("the connect link from the student's page also links the Telegram account", async () => {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: ali } });
    // Ali is held by account tg(2): unlink it the way staff would, then connect by code.
    const [row] = await listStudentAccess(ceo, ali);
    await unlinkStudentAccess(ceo, ali, row!.linkId);
    const code = student.telegramCode ?? "code" + RUN + "abcdefgh";
    if (!student.telegramCode)
      await prisma.student.update({ where: { id: ali }, data: { telegramCode: code } });
    await handleStudentCommand(prisma, DEMO_ORG_ID, {
      chatId: tg(7),
      text: `/start ${code}`,
      fromId: tg(7),
      firstName: "Ali",
      languageCode: "en",
    });
    const access = await listStudentAccess(ceo, ali);
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ via: "CODE", who: { kind: "STUDENT" } });
  });
});

describe("staff access card (A-150)", () => {
  it("lists the student's and parents' accounts and signs them out", async () => {
    const access = await listStudentAccess(ceo, vali);
    expect(access.map((a) => a.who.kind).sort()).toEqual(["PARENT", "STUDENT"]);
    const parent = access.find((a) => a.who.kind === "PARENT")!;
    expect(parent.devices).toBeGreaterThan(0);
    await signOutStudentAccess(ceo, vali, parent.linkId);
    expect(
      (await listStudentAccess(ceo, vali)).find((a) => a.linkId === parent.linkId)!.devices,
    ).toBe(0);
    await expect(
      unlinkStudentAccess({ ...ceo, permissions: ["students.view"] }, vali, parent.linkId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await unlinkStudentAccess(ceo, vali, parent.linkId);
    expect((await listStudentAccess(ceo, vali)).some((a) => a.linkId === parent.linkId)).toBe(
      false,
    );
    expect(parentOfVali).toBeTruthy();
  });
});
