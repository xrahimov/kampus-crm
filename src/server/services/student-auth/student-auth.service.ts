import { randomBytes } from "node:crypto";

import type { StudentLinkVia } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { generateToken, safeEqual, sha256 } from "@/server/auth/tokens";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import {
  createTelegramLoginProvider,
  pkceChallenge,
  TelegramLoginError,
  type TelegramIdentity,
} from "@/server/integrations/telegram/login";
import {
  findOrganizationByConfig,
  loadIntegrationConfig,
  telegramConfigFor,
} from "@/server/services/integrations/integrations.service";
import { organizationForHost } from "@/server/services/settings/domains.service";
import { normalizePhone } from "@/server/services/students/import.service";

/*
 * Student and parent sign-in with Telegram (A-150). Nobody registers: a
 * Telegram login opens Kampus only when the Telegram-verified phone (or a chat
 * the student linked from their own page) belongs to a student or parent the
 * centre already has. The account is one per Telegram user and may hold links
 * to records in several centres; a session is a cookie of its own, separate
 * from the staff session.
 */

/** A student session lasts 30 days and slides on use. */
export const STUDENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STUDENT_SESSION_TOUCH_MS = 60 * 60 * 1000;
/** The bot's sign-in link works once, for ten minutes. */
export const LOGIN_TICKET_TTL_MS = 10 * 60 * 1000;
/** The browser has this long to come back from Telegram's consent screen. */
export const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

export interface LoginSetup {
  /** The centre whose bot is the OAuth client. */
  botOrganizationId: string;
  clientId: string;
  clientSecret: string;
  botUsername: string | null;
  /** Only this centre's people may sign in here; null on the server's own address with the shared bot. */
  scopeOrganizationId: string | null;
  brand: { name: string; logoUrl: string | null } | null;
}

/**
 * Which bot signs people in on this address: on a centre's own domain, that
 * centre's bot (its own, or the shared one it uses), limited to its people; on
 * the server's address, the site owner's shared bot for everyone, or the only
 * centre that set up a login when no bot is shared.
 */
export async function resolveLoginSetup(
  db: DbClient,
  host: string | null,
): Promise<LoginSetup | null> {
  const brand = await organizationForHost(host, db);
  if (brand) {
    const effective = await telegramConfigFor(db, brand.organizationId);
    if (!effective?.config.loginClientId || !effective.config.loginClientSecret) return null;
    return {
      botOrganizationId: effective.organizationId,
      clientId: effective.config.loginClientId,
      clientSecret: effective.config.loginClientSecret,
      botUsername: effective.config.botUsername || null,
      scopeOrganizationId: brand.organizationId,
      brand: { name: brand.name, logoUrl: brand.logoUrl },
    };
  }
  const sharedId = await findOrganizationByConfig(
    db,
    "TELEGRAM",
    (c) => c.sharedWithAllCentres === true && Boolean(c.loginClientId),
  );
  const candidates = sharedId
    ? [sharedId]
    : await (async () => {
        const rows = await db.integrationSetting.findMany({
          where: { provider: "TELEGRAM", isEnabled: true },
          select: { organizationId: true, config: true },
        });
        return rows
          .filter((r) => Boolean((r.config as Record<string, unknown>)?.loginClientId))
          .map((r) => r.organizationId);
      })();
  if (candidates.length !== 1) return null;
  const organizationId = candidates[0]!;
  const config = await loadIntegrationConfig(db, "TELEGRAM", organizationId);
  if (!config?.isEnabled || !config.loginClientId || !config.loginClientSecret) return null;
  let brandOfOnly: LoginSetup["brand"] = null;
  if (!sharedId) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    });
    brandOfOnly = org ? { name: org.name, logoUrl: org.logoUrl } : null;
  }
  return {
    botOrganizationId: organizationId,
    clientId: config.loginClientId,
    clientSecret: config.loginClientSecret,
    botUsername: config.botUsername || null,
    scopeOrganizationId: sharedId ? null : organizationId,
    brand: brandOfOnly,
  };
}

/* ----- the browser flow ------------------------------------------------------------------- */

interface LoginState {
  state: string;
  verifier: string;
  nonce: string;
  next: string;
  locale: string;
  at: number;
  /** Who is signing in; absent on a student's login. Staff use the same callback address (A-180). */
  kind?: "staff";
}

/** Only paths inside the student area are accepted as the place to land after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && /^\/(?:[a-z]{2}\/)?student(?:\/[A-Za-z0-9_/-]*)?$/.test(next) ? next : "";
}

/** Where Telegram sends the browser back to; registered in BotFather as an allowed URL. */
export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/v1/student-auth/telegram/callback`;
}

/** Where a staff member may land after sign-in: a page of the app, never another site or the API. */
export function safeStaffNext(next: string | null | undefined): string {
  return next && /^\/(?!\/)(?!api\/)[A-Za-z0-9_\-/?=&%.]*$/.test(next) ? next : "";
}

/** Starts a login: the Telegram URL to send the browser to, and the state cookie to set. */
export async function startTelegramLogin(
  db: DbClient,
  input: {
    host: string | null;
    origin: string;
    next?: string | null;
    locale: string;
    kind?: "staff";
  },
): Promise<{ url: string; cookie: string }> {
  const setup = await resolveLoginSetup(db, input.host);
  if (!setup) {
    throw AppError.notFound(
      input.kind === "staff" ? "errors.staffTelegramOff" : "errors.studentLoginOff",
    );
  }
  const state: LoginState = {
    state: generateToken(16),
    verifier: randomBytes(32).toString("base64url"),
    nonce: generateToken(16),
    next: input.kind === "staff" ? safeStaffNext(input.next) : safeNext(input.next),
    locale: input.locale,
    at: Date.now(),
    ...(input.kind === "staff" ? { kind: "staff" as const } : {}),
  };
  const url = createTelegramLoginProvider().authorizeUrl({
    clientId: setup.clientId,
    redirectUri: callbackUrl(input.origin),
    state: state.state,
    nonce: state.nonce,
    codeChallenge: pkceChallenge(state.verifier),
  });
  return { url, cookie: Buffer.from(JSON.stringify(state)).toString("base64url") };
}

function readState(cookie: string | null | undefined): LoginState | null {
  if (!cookie) return null;
  try {
    const value = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as LoginState;
    if (typeof value.state !== "string" || typeof value.verifier !== "string") return null;
    if (Date.now() - Number(value.at) > LOGIN_STATE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** The language the login started in, for the error page when the state is gone or wrong. */
export function stateLocale(cookie: string | null | undefined): string | null {
  return readState(cookie)?.locale ?? null;
}

/** Whether the login that is coming back was started from the staff sign-in page (A-180). */
export function stateIsStaff(cookie: string | null | undefined): boolean {
  return readState(cookie)?.kind === "staff";
}

export interface TelegramReturn {
  host: string | null;
  origin: string;
  code: string | null;
  state: string | null;
  cookie: string | null | undefined;
}

/**
 * Telegram came back with a code: checks it against the state the browser left
 * with and exchanges it for the person Telegram vouches for. Shared by the
 * student and the staff sign-in.
 */
export async function verifyTelegramReturn(
  db: DbClient,
  input: TelegramReturn,
): Promise<{
  identity: TelegramIdentity;
  setup: LoginSetup;
  next: string;
  locale: string | null;
  staff: boolean;
}> {
  const saved = readState(input.cookie);
  if (!saved || !input.state || !input.code || !safeEqual(saved.state, input.state)) {
    throw AppError.unauthenticated("errors.studentLoginExpired");
  }
  const setup = await resolveLoginSetup(db, input.host);
  if (!setup) throw AppError.notFound("errors.studentLoginOff");
  let identity: TelegramIdentity;
  try {
    identity = await createTelegramLoginProvider().exchange({
      client: { clientId: setup.clientId, clientSecret: setup.clientSecret },
      code: input.code,
      redirectUri: callbackUrl(input.origin),
      codeVerifier: saved.verifier,
      nonce: saved.nonce,
    });
  } catch (error) {
    if (error instanceof TelegramLoginError) {
      console.error(error.message);
      throw AppError.unauthenticated("errors.studentLoginFailed");
    }
    throw error;
  }
  return {
    identity,
    setup,
    next: saved.next,
    locale: saved.locale ?? null,
    staff: saved.kind === "staff",
  };
}

/** Telegram came back with a code: verify it and sign the student or parent in. */
export async function finishTelegramLogin(
  db: DbClient,
  input: TelegramReturn,
  ctx: LoginContext,
): Promise<{ token: string; next: string; locale: string | null }> {
  const back = await verifyTelegramReturn(db, input);
  // A code asked for on the staff page never opens a student session, and the other way round.
  if (back.staff) throw AppError.unauthenticated("errors.studentLoginExpired");
  const account = await db.$transaction((tx) =>
    accountForIdentity(tx, back.identity, back.setup.scopeOrganizationId),
  );
  const token = await createStudentSession(db, account.id, ctx);
  return { token, next: back.next, locale: back.locale };
}

/* ----- matching people ---------------------------------------------------------------------- */

/** Telegram's digits → the form Kampus stores phones in (+998…), or null. */
export function phoneFromTelegram(digits: string | null): string | null {
  if (!digits) return null;
  const normalized = normalizePhone(digits);
  return normalized && /^\+\d{10,15}$/.test(normalized) ? normalized : null;
}

/**
 * The account for this Telegram user, after linking every student and parent
 * whose phone equals the Telegram-verified one (and that nobody else holds).
 * Refuses, creating nothing, when the person matches no one (A-150).
 */
export async function accountForIdentity(
  tx: DbClient,
  identity: TelegramIdentity,
  scopeOrganizationId: string | null,
  options: { via?: StudentLinkVia } = {},
) {
  const phone = phoneFromTelegram(identity.phone);
  const existing = await tx.studentAccount.findUnique({
    where: { telegramUserId: identity.telegramUserId },
  });
  const scope = scopeOrganizationId ? { branch: { organizationId: scopeOrganizationId } } : {};
  const students = phone
    ? await tx.student.findMany({
        where: { phone, isArchived: false, isBlacklisted: false, ...scope },
        select: {
          id: true,
          branchId: true,
          branch: { select: { organizationId: true } },
          accountLinks: { select: { accountId: true } },
        },
      })
    : [];
  const parents = phone
    ? await tx.parent.findMany({
        where: { phone, student: { isArchived: false, ...scope } },
        select: {
          id: true,
          student: { select: { branchId: true, branch: { select: { organizationId: true } } } },
          accountLinks: { select: { accountId: true } },
        },
      })
    : [];
  const freeStudents = students.filter(
    (s) => s.accountLinks.length === 0 || s.accountLinks[0]!.accountId === existing?.id,
  );
  const freeParents = parents.filter(
    (p) => p.accountLinks.length === 0 || p.accountLinks[0]!.accountId === existing?.id,
  );
  const hasLinks = existing
    ? (await tx.studentAccountLink.count({
        where: {
          accountId: existing.id,
          ...(scopeOrganizationId ? { organizationId: scopeOrganizationId } : {}),
        },
      })) > 0
    : false;
  if (!hasLinks && freeStudents.length === 0 && freeParents.length === 0) {
    throw AppError.forbidden(
      students.length + parents.length > 0
        ? "errors.studentLinkedElsewhere"
        : "errors.studentNotRegistered",
    );
  }
  const data = {
    name: identity.name,
    username: identity.username,
    photoUrl: identity.photoUrl,
    ...(phone ? { phone } : {}),
    lastSeenAt: new Date(),
  };
  const account = existing
    ? await tx.studentAccount.update({ where: { id: existing.id }, data })
    : await tx.studentAccount.create({
        data: { telegramUserId: identity.telegramUserId, ...data },
      });
  const via = options.via ?? "PHONE";
  for (const s of freeStudents) {
    if (s.accountLinks.length > 0) continue;
    await tx.studentAccountLink.create({
      data: {
        accountId: account.id,
        studentId: s.id,
        organizationId: s.branch.organizationId,
        via,
      },
    });
    await recordAudit(tx, null, {
      action: "student.account.link",
      entity: "Student",
      entityId: s.id,
      after: { telegram: identity.username ?? identity.name, via },
      branchId: s.branchId,
      organizationId: s.branch.organizationId,
    });
  }
  for (const p of freeParents) {
    if (p.accountLinks.length > 0) continue;
    await tx.studentAccountLink.create({
      data: {
        accountId: account.id,
        parentId: p.id,
        organizationId: p.student.branch.organizationId,
        via,
      },
    });
  }
  return account;
}

/**
 * A chat opened the student's own connect link (A-103): the same Telegram user
 * may then sign in as that student, even when Telegram has a different phone.
 */
export async function linkAccountByCode(
  tx: DbClient,
  identity: Omit<TelegramIdentity, "phone">,
  student: { id: string; branchId: string; organizationId: string },
): Promise<void> {
  const held = await tx.studentAccountLink.findUnique({ where: { studentId: student.id } });
  const account = await tx.studentAccount.upsert({
    where: { telegramUserId: identity.telegramUserId },
    create: {
      telegramUserId: identity.telegramUserId,
      name: identity.name,
      username: identity.username,
    },
    update: {},
  });
  if (held) return; // one account per student; staff unlink the old one first
  await tx.studentAccountLink.create({
    data: {
      accountId: account.id,
      studentId: student.id,
      organizationId: student.organizationId,
      via: "CODE",
    },
  });
  await recordAudit(tx, null, {
    action: "student.account.link",
    entity: "Student",
    entityId: student.id,
    after: { telegram: identity.username ?? identity.name, via: "CODE" },
    branchId: student.branchId,
    organizationId: student.organizationId,
  });
}

/* ----- sessions and tickets ------------------------------------------------------------------ */

export async function createStudentSession(
  db: DbClient,
  accountId: string,
  ctx: LoginContext,
  now = new Date(),
): Promise<string> {
  const token = generateToken();
  await db.studentSession.create({
    data: {
      accountId,
      tokenHash: sha256(token),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      expiresAt: new Date(now.getTime() + STUDENT_SESSION_TTL_MS),
      lastSeenAt: now,
    },
  });
  await db.studentAccount.update({ where: { id: accountId }, data: { lastSeenAt: now } });
  return token;
}

export interface StudentPrincipal {
  sessionId: string;
  account: {
    id: string;
    name: string;
    username: string | null;
    photoUrl: string | null;
    phone: string | null;
  };
  /** Students this person is, and students whose parent this person is. */
  studentIds: string[];
  childIds: string[];
}

/** The signed-in student or parent behind a session cookie, or null. */
export async function resolveStudentSession(
  db: DbClient,
  token: string | null | undefined,
  now = new Date(),
): Promise<StudentPrincipal | null> {
  if (!token) return null;
  const session = await db.studentSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      account: {
        include: {
          links: {
            select: {
              studentId: true,
              organizationId: true,
              student: { select: { isArchived: true, isBlacklisted: true } },
              parent: { select: { student: { select: { id: true, isArchived: true } } } },
            },
          },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.studentSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const suspended = new Set(
    (
      await db.organization.findMany({
        where: {
          id: { in: session.account.links.map((l) => l.organizationId) },
          suspendedAt: { not: null },
        },
        select: { id: true },
      })
    ).map((o) => o.id),
  );
  const links = session.account.links.filter((l) => !suspended.has(l.organizationId));
  const studentIds = links
    .filter((l) => l.studentId && l.student && !l.student.isArchived && !l.student.isBlacklisted)
    .map((l) => l.studentId!);
  const childIds = links
    .filter((l) => l.parent && !l.parent.student.isArchived)
    .map((l) => l.parent!.student.id)
    .filter((id) => !studentIds.includes(id));
  if (studentIds.length === 0 && childIds.length === 0) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > STUDENT_SESSION_TOUCH_MS) {
    await db.studentSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + STUDENT_SESSION_TTL_MS) },
    });
  }
  const a = session.account;
  return {
    sessionId: session.id,
    account: {
      id: a.id,
      name: a.name,
      username: a.username,
      photoUrl: a.photoUrl,
      phone: a.phone,
    },
    studentIds,
    childIds: [...new Set(childIds)],
  };
}

export async function revokeStudentSession(db: DbClient, token: string | null | undefined) {
  if (!token) return;
  await db.studentSession.deleteMany({ where: { tokenHash: sha256(token) } });
}

/** "Sign out everywhere": every device of this account. */
export async function revokeAllStudentSessions(db: DbClient, accountId: string) {
  await db.studentSession.deleteMany({ where: { accountId } });
}

/** A one-time sign-in link for the bot to send; the raw token is returned once. */
export async function issueLoginTicket(
  db: DbClient,
  accountId: string,
  now = new Date(),
): Promise<string> {
  const token = generateToken(24);
  await db.studentLoginTicket.create({
    data: {
      accountId,
      tokenHash: sha256(token),
      expiresAt: new Date(now.getTime() + LOGIN_TICKET_TTL_MS),
    },
  });
  return token;
}

/** Spends a ticket: a new session token, or an error for a used, expired or unknown link. */
export async function redeemLoginTicket(
  db: DbClient,
  raw: string,
  ctx: LoginContext,
  now = new Date(),
): Promise<string> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw))
    throw AppError.unauthenticated("errors.studentLinkExpired");
  const spent = await db.studentLoginTicket.updateMany({
    where: { tokenHash: sha256(raw), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (spent.count !== 1) throw AppError.unauthenticated("errors.studentLinkExpired");
  const ticket = await db.studentLoginTicket.findUniqueOrThrow({
    where: { tokenHash: sha256(raw) },
    select: { accountId: true },
  });
  return createStudentSession(db, ticket.accountId, ctx, now);
}

/** The page a ticket or a finished login lands on. */
export function studentHomeUrl(origin: string, locale: string, next = ""): string {
  return `${origin.replace(/\/$/, "")}${next || `/${locale}/student`}`;
}
