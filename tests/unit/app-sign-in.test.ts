/**
 * The phone app's sign-in (A-203): a session token in the answer instead of a
 * cookie, sent back as a Bearer header, a session that lives 30 days, and the
 * student home and personal page as data. Runs against the real database.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { GET as meRoute } from "@/app/api/v1/auth/me/route";
import { POST as logoutRoute } from "@/app/api/v1/auth/logout/route";
import { GET as handoffOpen, POST as handoffAsk } from "@/app/api/v1/auth/web-handoff/route";
import { GET as studentHomeRoute } from "@/app/api/v1/student-auth/home/route";
import { POST as studentLogoutRoute } from "@/app/api/v1/student-auth/logout/route";
import {
  APP_CLIENT_HEADER,
  APP_SESSION_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "@/lib/auth/constants";
import { bearerToken, isAppRequest, requestSessionToken } from "@/server/auth/app-client";
import { describeDevice } from "@/server/auth/device";
import { hashPassword } from "@/server/auth/password";
import { createSession, findSessionByToken } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import {
  createWebHandoff,
  isSitePath,
  redeemWebHandoff,
  WEB_HANDOFF_TTL_MS,
} from "@/server/services/sign-in/web-handoff.service";
import {
  createStudentSession,
  resolveStudentSession,
} from "@/server/services/student-auth/student-auth.service";

const PHONE = "+998901230301";
const PASSWORD = "app-password-1";
const STUDENT_PHONE = "+998901230302";
const APP_AGENT = "KampusApp/1.0.0 (Android 15; SM-F966B)";

let orgId: string;
let branchId: string;
let userId: string;
let accountId: string;

const noParams = { params: Promise.resolve({}) } as never;

function request(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: {
      host: "localhost:3000",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: "App sign-in org" } });
  orgId = org.id;
  branchId = (await prisma.branch.create({ data: { organizationId: org.id, name: "Main" } })).id;
  const role = await prisma.role.upsert({
    where: { code: "TEST_ROLE" },
    update: {},
    create: { code: "TEST_ROLE", name: "Test role", permissions: ["groups.view"] },
  });
  await prisma.user.deleteMany({ where: { phone: PHONE } });
  userId = (
    await prisma.user.create({
      data: {
        organizationId: org.id,
        phone: PHONE,
        fullName: "App Tester",
        passwordHash: await hashPassword(PASSWORD),
        telegramVerifiedAt: new Date(),
        roles: { create: { roleId: role.id } },
        branches: { create: { branchId } },
      },
    })
  ).id;
  await prisma.studentAccount.deleteMany({ where: { telegramUserId: "990012300302" } });
  accountId = (
    await prisma.studentAccount.create({
      data: { telegramUserId: "990012300302", name: "App Student", phone: STUDENT_PHONE },
    })
  ).id;
  // A student account opens something only while it is linked to a student record.
  const student = await prisma.student.create({
    data: { branchId, fullName: "App Student", phone: STUDENT_PHONE },
  });
  await prisma.studentAccountLink.create({
    data: { accountId, studentId: student.id, organizationId: org.id, via: "PHONE" },
  });
  await prisma.loginAttempt.deleteMany({});
});

afterAll(async () => {
  await prisma.studentAccount.deleteMany({ where: { id: accountId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("the app's token header", () => {
  it("reads a Bearer token and nothing else", () => {
    const token = "a".repeat(43);
    expect(bearerToken(request("/x", { headers: { authorization: `Bearer ${token}` } }))).toBe(
      token,
    );
    expect(bearerToken(request("/x"))).toBeNull();
    expect(bearerToken(request("/x", { headers: { authorization: "Basic abc" } }))).toBeNull();
    expect(bearerToken(request("/x", { headers: { authorization: "Bearer short" } }))).toBeNull();
    expect(
      bearerToken(request("/x", { headers: { authorization: `Bearer ${token} extra` } })),
    ).toBeNull();
  });

  it("prefers the header over the cookie and says which one it was", () => {
    const header = "h".repeat(43);
    const both = request("/x", {
      headers: { authorization: `Bearer ${header}`, cookie: `${SESSION_COOKIE}=cookie-token` },
    });
    expect(requestSessionToken(both, SESSION_COOKIE)).toEqual({ token: header, fromHeader: true });
    const cookie = request("/x", { headers: { cookie: `${SESSION_COOKIE}=cookie-token` } });
    expect(requestSessionToken(cookie, SESSION_COOKIE)).toEqual({
      token: "cookie-token",
      fromHeader: false,
    });
    expect(requestSessionToken(request("/x"), SESSION_COOKIE)).toEqual({
      token: null,
      fromHeader: false,
    });
  });

  it("knows the app by its header", () => {
    expect(isAppRequest(request("/x", { headers: { [APP_CLIENT_HEADER]: "1.0.0" } }))).toBe(true);
    expect(isAppRequest(request("/x"))).toBe(false);
  });

  it("names the app in the list of devices", () => {
    expect(describeDevice(APP_AGENT)).toBe("Kampus app · Android");
    expect(describeDevice("KampusApp/1.0.0 (iOS 19.1; iPhone)")).toBe("Kampus app · iPhone");
    expect(describeDevice("KampusApp/1.0.0 (iPadOS 19.1; iPad)")).toBe("Kampus app · iPad");
  });
});

describe("an app session", () => {
  it("lives 30 days and is pushed forward by 30 days when used", async () => {
    const now = new Date("2026-11-23T00:00:00Z");
    const issued = await createSession(
      prisma,
      { userId, activeBranchId: branchId, app: true },
      now,
    );
    expect(issued.session.app).toBe(true);
    expect(issued.session.expiresAt.getTime()).toBe(now.getTime() + APP_SESSION_TTL_MS);

    // Still there after a fortnight of silence, where a browser session is long gone.
    const later = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const found = await findSessionByToken(prisma, issued.token, later);
    expect(found?.expiresAt.getTime()).toBe(later.getTime() + APP_SESSION_TTL_MS);

    const browser = await createSession(prisma, { userId, activeBranchId: branchId }, now);
    expect(browser.session.app).toBe(false);
    expect(browser.session.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    const touched = new Date(now.getTime() + SESSION_TOUCH_INTERVAL_MS + 1000);
    expect((await findSessionByToken(prisma, browser.token, touched))?.expiresAt.getTime()).toBe(
      touched.getTime() + SESSION_TTL_MS,
    );
    expect(await findSessionByToken(prisma, browser.token, later)).toBeNull();
  });
});

describe("signing in from the app", () => {
  it("answers with the token, sets no cookie, and the token opens the API", async () => {
    const response = await loginRoute(
      request("/api/v1/auth/login", {
        method: "POST",
        headers: { [APP_CLIENT_HEADER]: "1.0.0", "user-agent": APP_AGENT },
        body: { phone: PHONE, password: PASSWORD, door: "STAFF" },
      }),
      noParams,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = (await response.json()) as { ok: boolean; to: string; token: string };
    expect(body).toMatchObject({ ok: true, to: "staff" });
    expect(body.token).toHaveLength(43);

    const session = await findSessionByToken(prisma, body.token);
    expect(session?.app).toBe(true);
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: session!.id } });
    expect(stored.userAgent).toBe(APP_AGENT);

    const me = await meRoute(
      request("/api/v1/auth/me", { headers: { authorization: `Bearer ${body.token}` } }),
      noParams,
    );
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { phone: string } }).user.phone).toBe(PHONE);

    // A change needs no CSRF token when the session came in a header…
    const out = await logoutRoute(
      request("/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${body.token}` },
      }),
      noParams,
    );
    expect(out.status).toBe(200);
    expect(await findSessionByToken(prisma, body.token)).toBeNull();
  });

  it("still asks a browser's cookie for the CSRF token", async () => {
    const issued = await createSession(prisma, { userId, activeBranchId: branchId });
    const response = await logoutRoute(
      request("/api/v1/auth/logout", {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${issued.token}`, origin: "http://localhost:3000" },
      }),
      noParams,
    );
    expect(response.status).toBe(403);
    expect(await findSessionByToken(prisma, issued.token)).not.toBeNull();
  });

  it("a browser's sign-in still gets cookies and no token in the answer", async () => {
    const response = await loginRoute(
      request("/api/v1/auth/login", {
        method: "POST",
        body: { phone: PHONE, password: PASSWORD, door: "STAFF" },
      }),
      noParams,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token).toBeUndefined();
    expect(body.csrfToken).toBeTypeOf("string");
  });

  it("refuses a token nobody was given", async () => {
    const me = await meRoute(
      request("/api/v1/auth/me", { headers: { authorization: `Bearer ${"x".repeat(43)}` } }),
      noParams,
    );
    expect(me.status).toBe(401);
  });
});

describe("the student side of the app", () => {
  it("gives the student home to a Bearer token and 401 without one", async () => {
    const token = await createStudentSession(prisma, accountId, { userAgent: APP_AGENT });
    const none = await studentHomeRoute(request("/api/v1/student-auth/home"), noParams);
    expect(none.status).toBe(401);

    const home = await studentHomeRoute(
      request("/api/v1/student-auth/home", { headers: { authorization: `Bearer ${token}` } }),
      noParams,
    );
    expect(home.status).toBe(200);
    const body = (await home.json()) as {
      account: { id: string };
      profiles: Array<{ fullName: string; relation: string }>;
      signedInWith: string;
    };
    expect(body.account.id).toBe(accountId);
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]).toMatchObject({ fullName: "App Student", relation: "SELF" });
    expect(body.signedInWith).toBe("TELEGRAM");

    // A staff token is not a student token.
    const staff = await createSession(prisma, { userId, activeBranchId: branchId, app: true });
    const wrong = await studentHomeRoute(
      request("/api/v1/student-auth/home", {
        headers: { authorization: `Bearer ${staff.token}` },
      }),
      noParams,
    );
    expect(wrong.status).toBe(401);
  });

  it("signs the app out with JSON, on this phone or everywhere", async () => {
    const first = await createStudentSession(prisma, accountId, {});
    const second = await createStudentSession(prisma, accountId, {});
    const one = await studentLogoutRoute(
      request("/api/v1/student-auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${first}` },
        body: {},
      }),
    );
    expect(one.status).toBe(200);
    expect(await one.json()).toEqual({ ok: true });
    expect(await resolveStudentSession(prisma, first)).toBeNull();
    expect(await resolveStudentSession(prisma, second)).not.toBeNull();

    const third = await createStudentSession(prisma, accountId, {});
    const all = await studentLogoutRoute(
      request("/api/v1/student-auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${third}` },
        body: { everywhere: true },
      }),
    );
    expect(all.status).toBe(200);
    expect(await resolveStudentSession(prisma, second)).toBeNull();
    expect(await resolveStudentSession(prisma, third)).toBeNull();
  });
});

describe("opening the site from the app (A-204)", () => {
  async function appToken(): Promise<string> {
    const issued = await createSession(prisma, { userId, activeBranchId: branchId, app: true });
    return issued.token;
  }
  const ask = (token: string, to: string) =>
    handoffAsk(
      request("/api/v1/auth/web-handoff", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, [APP_CLIENT_HEADER]: "1.0.0" },
        body: { to },
      }),
      noParams,
    );

  it("gives a one-time link that signs the browser in and goes to the page", async () => {
    const asked = await ask(await appToken(), "/uz/groups");
    expect(asked.status).toBe(200);
    const { path } = (await asked.json()) as { path: string };
    expect(path).toMatch(/^\/api\/v1\/auth\/web-handoff\?code=/);

    const opened = await handoffOpen(request(path), noParams);
    expect(opened.status).toBe(303);
    expect(opened.headers.get("location")).toBe("/uz/groups");
    const cookie = opened.headers.get("set-cookie") ?? "";
    const token = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(cookie)?.[1];
    expect(token).toBeTruthy();
    const session = await findSessionByToken(prisma, token!);
    expect(session?.userId).toBe(userId);
    // The browser's session is an ordinary one, not a 30-day app session.
    expect(session?.app).toBe(false);

    // The same link a second time signs nobody in.
    const again = await handoffOpen(request(path), noParams);
    expect(again.headers.get("location")).toBe("/");
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a link that has waited longer than a minute", async () => {
    const session = await findSessionByToken(prisma, await appToken());
    const { code } = await createWebHandoff(session!, "/uz/today");
    const late = new Date(Date.now() + WEB_HANDOFF_TTL_MS + 1000);
    expect(await redeemWebHandoff(code, { ip: null, userAgent: null }, prisma, late)).toBeNull();
  });

  it("leads only to pages of Kampus", async () => {
    for (const to of ["https://example.com", "//example.com", "/\\example.com", "/api/v1/users"]) {
      expect(isSitePath(to)).toBe(false);
      expect((await ask(await appToken(), to)).status).toBe(400);
    }
    expect(isSitePath("/uz/video/room-1?x=1")).toBe(true);
  });

  it("is for the app only: a browser session cannot ask for links", async () => {
    const issued = await createSession(prisma, { userId, activeBranchId: branchId });
    const response = await ask(issued.token, "/uz/groups");
    expect(response.status).toBe(403);
  });
});
