import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  AnnouncementFilters,
  AnnouncementInput,
  AnnouncementSortField,
} from "@/lib/validation/announcements";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { enqueue } from "@/server/jobs/queue";
import { authorize, branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope, ownGroupsOnly } from "@/server/services/groups/shared";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Announcements (A-129): a notice posted once to a group, a branch or the whole
 * centre. It lands on every addressed student's personal page, goes to the
 * Telegram chats linked to them (students and parents) and, when asked, to the
 * students' phones by SMS. The list shows how many were reached and how many
 * opened it on their page.
 */

/** Students who still belong to a group and so get the centre's and branch's notices. */
const OPEN = ["NEW", "TRIAL", "ACTIVE", "FROZEN"] as const;

export interface AnnouncementDto {
  id: string;
  audience: AnnouncementInput["audience"];
  branchId: string | null;
  branchName: string | null;
  groupId: string | null;
  groupName: string | null;
  title: string;
  body: string;
  sendSms: boolean;
  recipients: number;
  telegramQueued: number;
  smsQueued: number;
  reads: number;
  createdAt: string;
  createdByName: string | null;
}

export interface PortalAnnouncementDto {
  id: string;
  audience: AnnouncementInput["audience"];
  title: string;
  body: string;
  /** The group, branch or centre it was posted to. */
  from: string;
  createdAt: string;
  read: boolean;
}

const include = {
  branch: { select: { name: true } },
  group: { select: { name: true } },
  createdBy: { select: { fullName: true } },
  _count: { select: { reads: true } },
} satisfies Prisma.AnnouncementInclude;

type Row = Prisma.AnnouncementGetPayload<{ include: typeof include }>;

function toDto(row: Row): AnnouncementDto {
  return {
    id: row.id,
    audience: row.audience,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    groupId: row.groupId,
    groupName: row.group?.name ?? null,
    title: row.title,
    body: row.body,
    sendSms: row.sendSms,
    recipients: row.recipients,
    telegramQueued: row.telegramQueued,
    smsQueued: row.smsQueued,
    reads: row._count.reads,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy?.fullName ?? null,
  };
}

/** Announcements the actor may see: the centre's, their branches' and (teachers) their groups'. */
function scopeWhere(actor: Actor): Prisma.AnnouncementWhereInput {
  const organizationId = actor.organizationId;
  if (canAccessAllBranches(actor) && !actor.activeBranchId) return { organizationId };
  const branch = branchScope(actor);
  const or: Prisma.AnnouncementWhereInput[] = [
    { audience: "CENTRE" },
    { audience: "BRANCH", ...branch },
  ];
  or.push(
    ownGroupsOnly(actor)
      ? { audience: "GROUP", group: groupScope(actor) }
      : { audience: "GROUP", ...branch },
  );
  return { organizationId, OR: or };
}

export async function listAnnouncements(
  actor: Actor,
  query: ParsedList<AnnouncementSortField>,
  filters: AnnouncementFilters,
  db: DbClient = prisma,
): Promise<Page<AnnouncementDto>> {
  authorize(actor, "announcements.view");
  const where: Prisma.AnnouncementWhereInput = { AND: [scopeWhere(actor)] };
  if (filters.audience) where.audience = filters.audience;
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.groupId) where.groupId = filters.groupId;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { body: { contains: query.q, mode: "insensitive" } },
    ];
  }
  const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] =
    query.sort.field === "title"
      ? [{ title: query.sort.direction }, { createdAt: "desc" }]
      : [{ createdAt: query.sort.direction }];
  const [rows, total] = await Promise.all([
    db.announcement.findMany({ where, include, orderBy, skip: query.skip, take: query.take }),
    db.announcement.count({ where }),
  ]);
  return { items: rows.map(toDto), total, page: query.page, pageSize: query.pageSize };
}

/** Groups the actor may post to, for the dialog. */
export async function announcementGroupOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<Array<{ id: string; name: string; branchId: string }>> {
  return db.group.findMany({
    where: { ...groupScope(actor), status: { not: "ARCHIVED" } },
    select: { id: true, name: true, branchId: true },
    orderBy: { name: "asc" },
  });
}

/** The students an announcement is addressed to, with their phones for the SMS. */
async function resolveTarget(
  db: DbClient,
  actor: Actor,
  input: AnnouncementInput,
): Promise<{
  branchId: string | null;
  groupId: string | null;
  from: string;
  students: Array<{ id: string; fullName: string; phone: string | null; branchId: string }>;
}> {
  const select = { id: true, fullName: true, phone: true, branchId: true } as const;
  switch (input.audience) {
    case "CENTRE": {
      if (!canAccessAllBranches(actor)) throw AppError.forbidden();
      const org = await db.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { name: true },
      });
      const students = await db.student.findMany({
        where: {
          isArchived: false,
          branch: { organizationId: actor.organizationId },
          memberships: { some: { status: { in: [...OPEN] } } },
        },
        select,
      });
      return { branchId: null, groupId: null, from: org.name, students };
    }
    case "BRANCH": {
      const branchId = input.branchId!;
      if (!canAccessAllBranches(actor) && !actor.branchIds.includes(branchId)) {
        throw AppError.forbidden();
      }
      const branch = await db.branch.findFirst({
        where: { id: branchId, organizationId: actor.organizationId },
        select: { name: true },
      });
      if (!branch) throw AppError.validation({ branchId: ["validation.branchUnknown"] });
      const students = await db.student.findMany({
        where: {
          isArchived: false,
          branchId,
          memberships: { some: { status: { in: [...OPEN] } } },
        },
        select,
      });
      return { branchId, groupId: null, from: branch.name, students };
    }
    case "GROUP": {
      const group = await findGroupInScope(db, actor, input.groupId!, {
        memberships: {
          where: { status: { in: [...OPEN] }, student: { isArchived: false } },
          select: { student: { select } },
        },
      });
      return {
        branchId: group.branchId,
        groupId: group.id,
        from: group.name,
        students: group.memberships.map((m) => m.student),
      };
    }
  }
}

/** Posts the announcement and queues the Telegram messages and, if asked, the SMS. */
export async function createAnnouncement(
  actor: Actor,
  input: AnnouncementInput,
  db: DbClient = prisma,
): Promise<AnnouncementDto> {
  authorize(actor, "announcements.create");
  const target = await resolveTarget(db, actor, input);
  const smsText = `${input.title}\n${input.body}`;
  return db.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        organizationId: actor.organizationId,
        audience: input.audience,
        branchId: target.branchId,
        groupId: target.groupId,
        title: input.title,
        body: input.body,
        sendSms: input.sendSms,
        recipients: target.students.length,
        createdById: actor.userId || null,
      },
    });
    const telegramQueued = await notifyStudents(tx, {
      studentIds: target.students.map((s) => s.id),
      kind: "announcement",
      refKey: `announcement:${row.id}`,
      values: { title: input.title, body: input.body, from: target.from },
    });
    let smsQueued = 0;
    if (input.sendSms) {
      for (const s of target.students) {
        if (!s.phone) continue;
        const message = await tx.smsMessage.create({
          data: {
            organizationId: actor.organizationId,
            branchId: s.branchId,
            recipientType: "STUDENT",
            recipientName: s.fullName,
            phone: s.phone,
            studentId: s.id,
            text: smsText,
            status: "QUEUED",
            sentById: actor.userId || null,
            refKey: `announcement:${row.id}:${s.id}`,
          },
        });
        await enqueue(tx, { type: "sms.send", payload: { messageId: message.id } });
        smsQueued += 1;
      }
    }
    const saved = await tx.announcement.update({
      where: { id: row.id },
      data: { telegramQueued, smsQueued },
      include,
    });
    await recordAudit(tx, actor, {
      action: "announcement.create",
      entity: "Announcement",
      entityId: row.id,
      after: {
        audience: input.audience,
        to: target.from,
        title: input.title,
        recipients: target.students.length,
        telegramQueued,
        smsQueued,
      },
      branchId: target.branchId,
    });
    return toDto(saved);
  });
}

/** Removes the notice from the students' pages; messages already sent stay sent. */
export async function deleteAnnouncement(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "announcements.create");
  const row = await db.announcement.findFirst({ where: { id, AND: [scopeWhere(actor)] }, include });
  if (!row) throw AppError.notFound();
  await db.$transaction(async (tx) => {
    await tx.announcement.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "announcement.delete",
      entity: "Announcement",
      entityId: id,
      before: { audience: row.audience, title: row.title, to: row.group?.name ?? row.branch?.name },
      branchId: row.branchId,
    });
  });
}

/* ----- the student's page ------------------------------------------------------------ */

async function portalWhere(db: DbClient, token: string) {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const branch = await db.branch.findUniqueOrThrow({
    where: { id: membership.group.branchId },
    select: { organizationId: true, name: true },
  });
  const where: Prisma.AnnouncementWhereInput = {
    organizationId: branch.organizationId,
    OR: [
      { audience: "CENTRE" },
      { audience: "BRANCH", branchId: membership.group.branchId },
      { audience: "GROUP", groupId: membership.groupId },
    ],
  };
  return { membership, where, branchName: branch.name };
}

/** The notices a student's link shows, newest first, with whether this student opened each. */
export async function listPortalAnnouncements(
  token: string,
  db: DbClient = prisma,
): Promise<PortalAnnouncementDto[] | null> {
  const scope = await portalWhere(db, token);
  if (!scope) return null;
  const [org, rows] = await Promise.all([
    db.branch.findUniqueOrThrow({
      where: { id: scope.membership.group.branchId },
      select: { organization: { select: { name: true } } },
    }),
    db.announcement.findMany({
      where: scope.where,
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        group: { select: { name: true } },
        branch: { select: { name: true } },
        reads: { where: { studentId: scope.membership.studentId }, select: { id: true } },
      },
    }),
  ]);
  return rows.map((r) => ({
    id: r.id,
    audience: r.audience,
    title: r.title,
    body: r.body,
    from: r.group?.name ?? r.branch?.name ?? org.organization.name,
    createdAt: r.createdAt.toISOString(),
    read: r.reads.length > 0,
  }));
}

/** The student opened these on their page: counted once per student. */
export async function markPortalAnnouncementsRead(
  token: string,
  ids: string[],
  db: DbClient = prisma,
): Promise<{ unread: number } | null> {
  const scope = await portalWhere(db, token);
  if (!scope) return null;
  const visible = await db.announcement.findMany({
    where: { ...scope.where, id: { in: ids } },
    select: { id: true },
  });
  if (visible.length > 0) {
    await db.announcementRead.createMany({
      data: visible.map((a) => ({
        announcementId: a.id,
        studentId: scope.membership.studentId,
      })),
      skipDuplicates: true,
    });
  }
  const unread = await db.announcement.count({
    where: { ...scope.where, reads: { none: { studentId: scope.membership.studentId } } },
  });
  return { unread };
}
