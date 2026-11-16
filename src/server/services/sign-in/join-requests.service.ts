import type { JoinRequestStatus, SignInDoor } from "@/generated/prisma/client";
import type {
  JoinRequestApproveInput,
  JoinRequestSendInput,
  JoinRequestTab,
} from "@/lib/validation/sign-in";
import { studentCreateSchema } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { generateToken, sha256 } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { can, type Actor } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { createStaff } from "@/server/services/staff/staff.service";
import { canCreateStudents } from "@/server/services/students/create-access";
import {
  addParent,
  createStudent,
  updateStudent,
} from "@/server/services/students/students.service";
import { botLocale } from "@/server/services/telegram/student-telegram.service";
import { localDay } from "@/server/services/vocab/streak";

import { settleJoinRequests, tellJoinPerson } from "./join-settle";

/*
 * The waiting list of the sign-in pages (A-196). Someone who proved a phone
 * with Telegram that no staff member, student or parent has is not turned
 * away: they say who they are and which centre and branch they belong to, and
 * wait until a teacher or manager lets them in. Letting in means the phone
 * comes to exist in Kampus: as a new student or staff member, or on the card
 * of someone the centre already has. A request also closes by itself when the
 * phone is added anywhere else in the app.
 */

/** An unfinished request (no centre chosen yet) is forgotten after a day. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export interface JoinCentreOption {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string }>;
}

export type JoinState =
  /** The person still has to say who they are; `token` lets this browser send it. */
  | { state: "draft"; token: string; fullName: string; centres: JoinCentreOption[] }
  /** Sent and waiting for the centre. */
  | { state: "sent"; centre: string | null }
  | { state: "declined"; centre: string | null };

interface Who {
  phone: string;
  door: SignInDoor;
  name: string;
  telegramUserId: string | null;
  chatId: string | null;
  botOrganizationId: string | null;
  locale: string;
  /** The centre of the address the person is on; null on the server's address. */
  scopeOrganizationId: string | null;
}

async function centreOptions(
  db: DbClient,
  scopeOrganizationId: string | null,
): Promise<JoinCentreOption[]> {
  const rows = await db.organization.findMany({
    where: scopeOrganizationId ? { id: scopeOrganizationId } : { suspendedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      branches: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });
  return rows.filter((o) => o.branches.length > 0);
}

/**
 * A proven phone that Kampus does not know: where its request stands, and for a
 * new or unfinished one the token to finish it with.
 */
export async function openJoinRequest(db: DbClient, who: Who): Promise<JoinState> {
  await db.joinRequest.deleteMany({
    where: { organizationId: null, createdAt: { lt: new Date(Date.now() - DRAFT_TTL_MS) } },
  });
  const scope = who.scopeOrganizationId ? { organizationId: who.scopeOrganizationId } : {};
  const latest = await db.joinRequest.findFirst({
    where: {
      phone: who.phone,
      organizationId: { not: null },
      status: { in: ["PENDING", "DECLINED"] },
      ...scope,
    },
    orderBy: { createdAt: "desc" },
    select: { status: true, organization: { select: { name: true } } },
  });
  if (latest) {
    return {
      state: latest.status === "DECLINED" ? "declined" : "sent",
      centre: latest.organization?.name ?? null,
    };
  }
  const centres = await centreOptions(db, who.scopeOrganizationId);
  if (centres.length === 0) throw AppError.forbidden("errors.studentNotRegistered");
  const token = generateToken(24);
  await db.joinRequest.deleteMany({ where: { phone: who.phone, organizationId: null } });
  await db.joinRequest.create({
    data: {
      phone: who.phone,
      door: who.door,
      fullName: who.name,
      telegramUserId: who.telegramUserId,
      chatId: who.chatId,
      botOrganizationId: who.botOrganizationId,
      locale: botLocale(who.locale),
      tokenHash: sha256(token),
    },
  });
  return { state: "draft", token, fullName: who.name, centres };
}

/** The person names themselves and their centre: the request reaches the centre's staff. */
export async function sendJoinRequest(
  db: DbClient,
  input: JoinRequestSendInput,
  scopeOrganizationId: string | null,
): Promise<JoinState> {
  const draft = await db.joinRequest.findUnique({ where: { tokenHash: sha256(input.token) } });
  if (!draft || draft.organizationId) throw AppError.unauthenticated("errors.joinRequestExpired");
  const centres = await centreOptions(db, scopeOrganizationId);
  const centre =
    centres.length === 1 ? centres[0] : centres.find((c) => c.id === input.organizationId);
  if (!centre) throw AppError.validation({ organizationId: ["validation.required"] });
  const branch =
    centre.branches.length === 1
      ? centre.branches[0]
      : centre.branches.find((b) => b.id === input.branchId);
  if (!branch) throw AppError.validation({ branchId: ["validation.required"] });

  await db.$transaction(async (tx) => {
    // Asking twice leaves one request.
    await tx.joinRequest.deleteMany({
      where: {
        phone: draft.phone,
        organizationId: centre.id,
        status: "PENDING",
        id: { not: draft.id },
      },
    });
    await tx.joinRequest.update({
      where: { id: draft.id },
      data: {
        fullName: input.fullName,
        note: input.note ?? null,
        organizationId: centre.id,
        branchId: branch.id,
        tokenHash: null,
      },
    });
    await notifyUsers(tx, {
      kind: "JOIN_REQUEST",
      params: { name: input.fullName, phone: draft.phone },
      href: "/join-requests",
      branchId: branch.id,
      organizationId: centre.id,
      permission: draft.door === "STAFF" ? "staff.create" : "students.create",
    });
  });
  return { state: "sent", centre: centre.name };
}

/* ----- the staff side ------------------------------------------------------------------------- */

export interface JoinRequestDto {
  id: string;
  door: SignInDoor;
  phone: string;
  fullName: string;
  note: string | null;
  branchId: string | null;
  branchName: string | null;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
}

/** Whose requests this person may answer: students', staff's, both or neither. */
export async function joinDoorsFor(actor: Actor, db: DbClient = prisma): Promise<SignInDoor[]> {
  const doors: SignInDoor[] = [];
  if (await canCreateStudents(actor, db)) doors.push("STUDENT");
  if (can(actor, "staff.create")) doors.push("STAFF");
  return doors;
}

function visibleWhere(actor: Actor, doors: SignInDoor[]) {
  return {
    organizationId: actor.organizationId,
    door: { in: doors },
    OR: [{ branchId: null }, { branchId: { in: actor.branchIds } }],
  };
}

/** How many people wait for this person's answer; the badge on the Students and Staff pages. */
export async function countJoinRequests(actor: Actor, db: DbClient = prisma): Promise<number> {
  const doors = await joinDoorsFor(actor, db);
  if (doors.length === 0) return 0;
  return db.joinRequest.count({ where: { ...visibleWhere(actor, doors), status: "PENDING" } });
}

export async function listJoinRequests(
  actor: Actor,
  tab: JoinRequestTab,
  db: DbClient = prisma,
): Promise<{ items: JoinRequestDto[]; doors: SignInDoor[] }> {
  const doors = await joinDoorsFor(actor, db);
  if (doors.length === 0) throw AppError.forbidden();
  // Whoever was added since the list was last opened is no longer waiting.
  if (tab === "PENDING") {
    const waiting = await db.joinRequest.findMany({
      where: { ...visibleWhere(actor, doors), status: "PENDING" },
      select: { phone: true },
    });
    for (const phone of new Set(waiting.map((w) => w.phone))) await settleJoinRequests(db, phone);
  }
  const rows = await db.joinRequest.findMany({
    where: { ...visibleWhere(actor, doors), status: tab },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      branch: { select: { name: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
  return {
    doors,
    items: rows.map((r) => ({
      id: r.id,
      door: r.door,
      phone: r.phone,
      fullName: r.fullName,
      note: r.note,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decidedByName: r.decidedBy?.fullName ?? null,
    })),
  };
}

async function findVisible(db: DbClient, actor: Actor, id: string) {
  const doors = await joinDoorsFor(actor, db);
  const row =
    doors.length === 0
      ? null
      : await db.joinRequest.findFirst({
          where: { id, ...visibleWhere(actor, doors), status: { in: ["PENDING", "DECLINED"] } },
        });
  if (!row) throw AppError.notFound();
  return row;
}

/**
 * Lets a waiting person in. Each way goes through the service that normally
 * does it, so the same permissions and branch limits hold: a teacher who may
 * add students adds one; putting the number on an existing card needs the
 * right to edit students; a staff member needs the right to add staff and a
 * role the approver may grant.
 */
export async function approveJoinRequest(
  actor: Actor,
  id: string,
  input: JoinRequestApproveInput,
  db: DbClient = prisma,
): Promise<void> {
  const row = await findVisible(db, actor, id);
  const staffMode = input.mode === "newStaff";
  if (staffMode !== (row.door === "STAFF")) {
    throw AppError.validation({ mode: ["validation.joinRequestMode"] });
  }
  switch (input.mode) {
    case "newStudent": {
      const today = localDay();
      await createStudent(
        actor,
        studentCreateSchema.parse({
          branchId: input.branchId,
          fullName: input.fullName,
          phone: row.phone,
          gender: input.gender,
          membership: input.groupId ? { groupId: input.groupId, joinedAt: today } : null,
        }),
        db,
      );
      break;
    }
    case "student":
      await updateStudent(actor, input.studentId, { phone: row.phone }, db);
      break;
    case "parent":
      await addParent(actor, input.studentId, { fullName: input.fullName, phone: row.phone }, db);
      break;
    case "newStaff":
      await createStaff(
        actor,
        "staff",
        {
          fullName: input.fullName,
          phone: row.phone,
          gender: input.gender,
          roleCodes: [input.roleCode],
          branchIds: [input.branchId],
        },
        db,
      );
      break;
  }
  // The services above settle the request themselves when the phone fits; this
  // covers a phone they stored in another form and records who decided.
  await settleJoinRequests(db, row.phone, { decidedById: actor.userId });
  const after = await db.joinRequest.findUnique({ where: { id }, select: { status: true } });
  if (after?.status !== "APPROVED") {
    await db.joinRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: new Date(), decidedById: actor.userId },
    });
    await tellJoinPerson(db, row, "joinApproved");
  } else {
    await db.joinRequest.update({ where: { id }, data: { decidedById: actor.userId } });
  }
  await recordAudit(db, actor, {
    action: "joinRequest.approve",
    entity: "JoinRequest",
    entityId: id,
    after: { phone: row.phone, fullName: row.fullName, door: row.door, mode: input.mode },
    branchId: row.branchId,
  });
}

export async function declineJoinRequest(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  const row = await findVisible(db, actor, id);
  if (row.status !== "PENDING") throw AppError.conflict("errors.joinRequestDecided");
  await db.$transaction(async (tx) => {
    await tx.joinRequest.update({
      where: { id },
      data: { status: "DECLINED", decidedAt: new Date(), decidedById: actor.userId },
    });
    await recordAudit(tx, actor, {
      action: "joinRequest.decline",
      entity: "JoinRequest",
      entityId: id,
      after: { phone: row.phone, fullName: row.fullName, door: row.door },
      branchId: row.branchId,
    });
  });
  await tellJoinPerson(db, row, "joinDeclined");
}
