import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  LeadDays,
  WaitlistEnrolInput,
  WaitlistEntryInput,
  WaitlistFilters,
  WaitlistOfferInput,
  WaitlistSortField,
  WaitlistStatus,
  WaitlistUpdateInput,
} from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";
import { addMember } from "@/server/services/groups/memberships.service";
import { findGroupInScope } from "@/server/services/groups/shared";
import { addLeadsToGroup } from "@/server/services/leads/leads.service";
import { dateToIso, mustFind } from "@/server/services/settings/shared";
import { renderTemplate } from "@/server/services/sms/auto-sms.service";
import { deliverMessage } from "@/server/services/sms/sms.service";
import { botDate, notifyStudents } from "@/server/services/telegram/student-telegram.service";

/*
 * Waiting list (round 2 B6, A-138): people who want a course for which no
 * group with a free seat exists yet. Entries queue per branch and course in the
 * order they were added; when a group opens, "Offer seats" texts the first
 * ones in line and marks them offered; enrolling closes the entry.
 */

export interface WaitlistEntryDto {
  id: string;
  branchId: string;
  branchName: string;
  courseId: string;
  courseName: string;
  leadId: string | null;
  studentId: string | null;
  fullName: string;
  phone: string;
  days: LeadDays | null;
  lessonTime: string | null;
  note: string | null;
  status: WaitlistStatus;
  /** 1-based place among the WAITING entries of the same branch and course; null once offered or closed. */
  position: number | null;
  offeredGroup: { id: string; name: string } | null;
  offeredAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface WaitlistSummary {
  waiting: number;
  offered: number;
  /** Waiting entries per course, for the filter and the group pages. */
  byCourse: Array<{ courseId: string; courseName: string; waiting: number }>;
}

export interface WaitlistListDto extends Page<WaitlistEntryDto> {
  summary: WaitlistSummary;
}

/** What "Offer seats" on a group would do, before it is pressed. */
export interface GroupWaitlistDto {
  waiting: number;
  /** Seats left by the smallest room on the schedule after members and open offers; null when no slot has a room. */
  freeSeats: number | null;
  /** Whether the "waiting list offer" auto-SMS switch is on for the centre. */
  smsActive: boolean;
  /** The entries an offer would reach, in order (up to the free seats, or all when unknown). */
  next: WaitlistEntryDto[];
}

export interface WaitlistOfferResult {
  offered: number;
  sms: number;
  telegram: number;
}

const include = {
  branch: { select: { name: true } },
  course: { select: { name: true } },
  offeredGroup: { select: { id: true, name: true } },
} satisfies Prisma.WaitlistEntryInclude;

type Row = Prisma.WaitlistEntryGetPayload<{ include: typeof include }>;

const OPEN: WaitlistStatus[] = ["WAITING", "OFFERED"];

function toDto(row: Row, position: number | null, createdBy: string | null): WaitlistEntryDto {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    courseId: row.courseId,
    courseName: row.course.name,
    leadId: row.leadId,
    studentId: row.studentId,
    fullName: row.fullName,
    phone: row.phone,
    days: row.days,
    lessonTime: row.lessonTime,
    note: row.note,
    status: row.status,
    position,
    offeredGroup: row.offeredGroup,
    offeredAt: row.offeredAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Places of the WAITING entries among their branch+course queue. */
async function positionsFor(db: DbClient, rows: Row[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const waiting = rows.filter((r) => r.status === "WAITING");
  const queues = new Set(waiting.map((r) => `${r.branchId}:${r.courseId}`));
  for (const key of queues) {
    const [branchId, courseId] = key.split(":") as [string, string];
    const queue = await db.waitlistEntry.findMany({
      where: { branchId, courseId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    queue.forEach((q, i) => out.set(q.id, i + 1));
  }
  return out;
}

async function namesOf(db: DbClient, ids: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (wanted.length === 0) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

async function toDtos(db: DbClient, rows: Row[]): Promise<WaitlistEntryDto[]> {
  const [positions, names] = await Promise.all([
    positionsFor(db, rows),
    namesOf(
      db,
      rows.map((r) => r.createdById),
    ),
  ]);
  return rows.map((r) =>
    toDto(
      r,
      positions.get(r.id) ?? null,
      r.createdById ? (names.get(r.createdById) ?? null) : null,
    ),
  );
}

export async function listWaitlist(
  actor: Actor,
  query: ParsedList<WaitlistSortField>,
  filters: WaitlistFilters = {},
  db: DbClient = prisma,
): Promise<WaitlistListDto> {
  authorize(actor, "leads.view");
  const scope = branchScope(actor);
  // The two summary cards follow the course filter; the per-course list does not.
  const courseWhere = filters.courseId ? { courseId: filters.courseId } : {};
  const where: Prisma.WaitlistEntryWhereInput = {
    ...scope,
    ...courseWhere,
    status: filters.status ?? { in: OPEN },
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { phone: { contains: query.q } },
          ],
        }
      : {}),
  };
  const [total, rows, waiting, offered, perCourse] = await Promise.all([
    db.waitlistEntry.count({ where }),
    db.waitlistEntry.findMany({
      where,
      include,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { createdAt: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
    db.waitlistEntry.count({ where: { ...scope, ...courseWhere, status: "WAITING" } }),
    db.waitlistEntry.count({ where: { ...scope, ...courseWhere, status: "OFFERED" } }),
    db.waitlistEntry.groupBy({
      by: ["courseId"],
      where: { ...scope, status: "WAITING" },
      _count: { _all: true },
    }),
  ]);
  const courses = await db.course.findMany({
    where: { id: { in: perCourse.map((c) => c.courseId) } },
    select: { id: true, name: true },
  });
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  return {
    items: await toDtos(db, rows),
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      waiting,
      offered,
      byCourse: perCourse
        .map((c) => ({
          courseId: c.courseId,
          courseName: courseName.get(c.courseId) ?? "",
          waiting: c._count._all,
        }))
        .sort((a, b) => a.courseName.localeCompare(b.courseName)),
    },
  };
}

export async function getWaitlistEntry(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<WaitlistEntryDto> {
  authorize(actor, "leads.view");
  const row = await mustFind(db.waitlistEntry.findUnique({ where: { id }, include }));
  authorizeBranch(actor, row.branchId);
  const [dto] = await toDtos(db, [row]);
  return dto!;
}

export async function createWaitlistEntry(
  actor: Actor,
  input: WaitlistEntryInput,
  db: DbClient = prisma,
): Promise<WaitlistEntryDto> {
  authorize(actor, "leads.create");
  authorizeBranch(actor, input.branchId);
  const course = await mustFind(
    db.course.findUnique({ where: { id: input.courseId }, select: { branchId: true } }),
  );
  if (course.branchId !== input.branchId) {
    throw AppError.validation({ courseId: ["validation.courseBranch"] });
  }
  if (input.leadId) {
    const lead = await mustFind(
      db.lead.findUnique({ where: { id: input.leadId }, select: { branchId: true } }),
      "errors.leadNotFound",
    );
    authorizeBranch(actor, lead.branchId);
  }
  if (input.studentId) {
    const student = await mustFind(
      db.student.findUnique({ where: { id: input.studentId }, select: { branchId: true } }),
      "errors.studentNotFound",
    );
    authorizeBranch(actor, student.branchId);
  }
  const duplicate = await db.waitlistEntry.findFirst({
    where: {
      branchId: input.branchId,
      courseId: input.courseId,
      phone: input.phone,
      status: { in: OPEN },
    },
    select: { id: true },
  });
  if (duplicate) throw AppError.conflict("errors.waitlistDuplicate");
  const row = await db.$transaction(async (tx) => {
    const created = await tx.waitlistEntry.create({
      data: {
        branchId: input.branchId,
        courseId: input.courseId,
        leadId: input.leadId ?? null,
        studentId: input.studentId ?? null,
        fullName: input.fullName,
        phone: input.phone,
        days: input.days ?? null,
        lessonTime: input.lessonTime ?? null,
        note: input.note ?? null,
        createdById: actor.userId || null,
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "waitlist.create",
      entity: "WaitlistEntry",
      entityId: created.id,
      after: { fullName: created.fullName, phone: created.phone, courseId: created.courseId },
      branchId: created.branchId,
    });
    return created;
  });
  const [dto] = await toDtos(db, [row]);
  return dto!;
}

export async function updateWaitlistEntry(
  actor: Actor,
  id: string,
  input: WaitlistUpdateInput,
  db: DbClient = prisma,
): Promise<WaitlistEntryDto> {
  authorize(actor, "leads.update");
  const before = await mustFind(db.waitlistEntry.findUnique({ where: { id }, include }));
  authorizeBranch(actor, before.branchId);
  if (before.status === "ENROLLED") throw AppError.conflict("errors.waitlistClosed");
  if (input.courseId && input.courseId !== before.courseId) {
    const course = await mustFind(
      db.course.findUnique({ where: { id: input.courseId }, select: { branchId: true } }),
    );
    if (course.branchId !== before.branchId) {
      throw AppError.validation({ courseId: ["validation.courseBranch"] });
    }
  }
  const closing = input.status === "DECLINED" || input.status === "REMOVED";
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.waitlistEntry.update({
      where: { id },
      data: {
        ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.days !== undefined ? { days: input.days } : {}),
        ...(input.lessonTime !== undefined ? { lessonTime: input.lessonTime } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.status
          ? {
              status: input.status,
              closedAt: closing ? new Date() : null,
              ...(input.status === "WAITING" ? { offeredGroupId: null, offeredAt: null } : {}),
            }
          : {}),
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "waitlist.update",
      entity: "WaitlistEntry",
      entityId: id,
      before: { status: before.status, courseId: before.courseId, note: before.note },
      after: { status: updated.status, courseId: updated.courseId, note: updated.note },
      branchId: before.branchId,
    });
    return updated;
  });
  const [dto] = await toDtos(db, [row]);
  return dto!;
}

/** Monday-first short weekday names in the centre's SMS language (Uzbek, like the templates). */
function weekdayNames(weekdays: number[]): string {
  const fmt = new Intl.DateTimeFormat("uz-Latn-UZ", { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  return [...new Set(weekdays)]
    .sort((a, b) => a - b)
    .map((d) => fmt.format(new Date(Date.UTC(2024, 0, d))))
    .join(", ");
}

async function groupForOffer(db: DbClient, actor: Actor, groupId: string) {
  const group = await findGroupInScope(db, actor, groupId, {
    slots: { include: { room: { select: { capacity: true } } } },
    branch: { select: { organizationId: true, organization: { select: { name: true } } } },
  });
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const capacities = group.slots
    .map((s) => s.room?.capacity ?? null)
    .filter((c): c is number => c !== null);
  // Members hold seats, and so do people already offered one here until they answer.
  const [taken, offered] = await Promise.all([
    db.groupMembership.count({ where: { groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } } }),
    db.waitlistEntry.count({ where: { offeredGroupId: groupId, status: "OFFERED" } }),
  ]);
  const freeSeats =
    capacities.length > 0 ? Math.max(0, Math.min(...capacities) - taken - offered) : null;
  return { group, freeSeats };
}

export async function getGroupWaitlist(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupWaitlistDto> {
  authorize(actor, "leads.view");
  const { group, freeSeats } = await groupForOffer(db, actor, groupId);
  const where = { branchId: group.branchId, courseId: group.courseId, status: "WAITING" as const };
  const [waiting, rows, setting] = await Promise.all([
    db.waitlistEntry.count({ where }),
    db.waitlistEntry.findMany({
      where,
      include,
      orderBy: { createdAt: "asc" },
      ...(freeSeats !== null ? { take: freeSeats } : {}),
    }),
    db.autoSmsSetting.findUnique({
      where: {
        organizationId_event: {
          organizationId: group.branch.organizationId,
          event: "WAITLIST_OFFER",
        },
      },
    }),
  ]);
  return {
    waiting,
    freeSeats,
    smsActive: setting?.isActive ?? false,
    next: await toDtos(db, rows),
  };
}

/**
 * "Offer seats": the first waiting entries of the group's course and branch,
 * as many as the group has free seats (or the limit given), get an SMS with the
 * group's days, time and start date and a Telegram message when they are a
 * linked student; each becomes OFFERED. Entries already offered a group are
 * not offered twice.
 */
export async function offerSeats(
  actor: Actor,
  groupId: string,
  input: WaitlistOfferInput,
  db: DbClient = prisma,
): Promise<WaitlistOfferResult> {
  authorize(actor, "leads.update");
  const { group, freeSeats } = await groupForOffer(db, actor, groupId);
  const limit = input.limit ?? freeSeats ?? undefined;
  if (limit === 0) return { offered: 0, sms: 0, telegram: 0 };
  const entries = await db.waitlistEntry.findMany({
    where: { branchId: group.branchId, courseId: group.courseId, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    ...(limit !== undefined ? { take: limit } : {}),
  });
  if (entries.length === 0) return { offered: 0, sms: 0, telegram: 0 };
  const organizationId = group.branch.organizationId;
  const setting = await db.autoSmsSetting.findUnique({
    where: { organizationId_event: { organizationId, event: "WAITLIST_OFFER" } },
  });
  const slots = [...group.slots].sort((a, b) => a.weekday - b.weekday);
  const first = slots[0];
  const time = first ? `${first.startTime}–${first.endTime}` : "";
  const days = weekdayNames(slots.map((s) => s.weekday));
  const startDate = dateToIso(group.startDate);
  const now = new Date();
  const smsIds: string[] = [];
  let telegram = 0;
  await db.$transaction(async (tx) => {
    for (const entry of entries) {
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: "OFFERED", offeredGroupId: groupId, offeredAt: now },
      });
      if (setting?.isActive) {
        const row = await tx.smsMessage.create({
          data: {
            organizationId,
            branchId: group.branchId,
            recipientType: entry.studentId ? "STUDENT" : "LEAD",
            recipientName: entry.fullName,
            phone: entry.phone,
            studentId: entry.studentId,
            text: renderTemplate(setting.template, {
              studentName: entry.fullName,
              groupName: group.name,
              days,
              time,
              date: startDate,
              centerName: group.branch.organization.name,
            }),
            status: "QUEUED",
            event: "WAITLIST_OFFER",
            sentById: actor.userId || null,
            refKey: `waitlist:${entry.id}:${groupId}`,
          },
        });
        smsIds.push(row.id);
      }
      if (entry.studentId) {
        telegram += await notifyStudents(tx, {
          studentIds: [entry.studentId],
          kind: "waitlistOffer",
          refKey: `waitlist:${entry.id}:${groupId}`,
          values: (locale) => ({
            group: group.name,
            days,
            time,
            date: botDate(locale, startDate),
          }),
        });
      }
    }
    await recordAudit(tx, actor, {
      action: "waitlist.offer",
      entity: "Group",
      entityId: groupId,
      after: { entries: entries.map((e) => e.id), freeSeats, sms: smsIds.length },
      branchId: group.branchId,
    });
  });
  let sms = 0;
  for (const id of smsIds) if ((await deliverMessage(db, id)) === "SENT") sms += 1;
  return { offered: entries.length, sms, telegram };
}

/**
 * The person joins a group: a lead goes through the leads-to-group path
 * (which converts it), a known student is added as a member, anyone else
 * becomes a new student with this membership. The entry is then ENROLLED.
 */
export async function enrolWaitlistEntry(
  actor: Actor,
  id: string,
  input: WaitlistEnrolInput,
  db: DbClient = prisma,
): Promise<WaitlistEntryDto> {
  authorize(actor, "leads.update");
  const entry = await mustFind(db.waitlistEntry.findUnique({ where: { id }, include }));
  authorizeBranch(actor, entry.branchId);
  if (entry.status === "ENROLLED") throw AppError.conflict("errors.waitlistClosed");
  const group = await findGroupInScope(db, actor, input.groupId, {});
  if (group.courseId !== entry.courseId) {
    throw AppError.validation({ groupId: ["validation.waitlistCourse"] });
  }
  const lead = entry.leadId
    ? await db.lead.findUnique({
        where: { id: entry.leadId },
        select: { id: true, isArchived: true },
      })
    : null;
  if (lead && !lead.isArchived) {
    await addLeadsToGroup(
      actor,
      {
        leadIds: [lead.id],
        groupId: input.groupId,
        joinedAt: input.joinedAt,
        status: input.status,
      },
      db,
    );
  } else {
    await addMember(
      actor,
      input.groupId,
      {
        ...(entry.studentId
          ? { studentId: entry.studentId }
          : { newStudent: { fullName: entry.fullName, phone: entry.phone } }),
        joinedAt: input.joinedAt,
        customPrice: null,
        note: null,
        status: input.status,
      },
      db,
    );
  }
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.waitlistEntry.update({
      where: { id },
      data: { status: "ENROLLED", closedAt: new Date(), offeredGroupId: input.groupId },
      include,
    });
    await recordAudit(tx, actor, {
      action: "waitlist.enrol",
      entity: "WaitlistEntry",
      entityId: id,
      before: { status: entry.status },
      after: { status: "ENROLLED", groupId: input.groupId },
      branchId: entry.branchId,
    });
    return updated;
  });
  const [dto] = await toDtos(db, [row]);
  return dto!;
}
