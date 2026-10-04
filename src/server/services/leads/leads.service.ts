import type { Prisma } from "@/generated/prisma/client";
import type {
  LeadDays,
  LeadFilters,
  LeadInput,
  LeadMoveInput,
  LeadsToGroupInput,
  LeadStatus,
  LeadTemperature,
  LeadUpdateInput,
  ToLeadInput,
} from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { enqueue } from "@/server/jobs/queue";
import { loadIntegrationConfig } from "@/server/services/integrations/integrations.service";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import {
  dateToIso,
  getOrganizationId,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

import { listBoards, type LeadBoardDto } from "./boards.service";
import {
  assertBranch,
  defaultColumnForBranch,
  findBoardInScope,
  findColumnInScope,
  leadScope,
} from "./shared";

/* Leads on the Kanban board (EXP §2). */

export interface LeadDto {
  id: string;
  branchId: string;
  boardId: string;
  columnId: string;
  fullName: string;
  phones: string[];
  birthDate: string | null;
  age: number | null;
  sourceId: string | null;
  sourceName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  days: LeadDays | null;
  lessonTime: string | null;
  status: LeadStatus;
  temperature: LeadTemperature | null;
  comment: string | null;
  sortOrder: number;
  isArchived: boolean;
  studentId: string | null;
  convertedAt: string | null;
  formName: string | null;
  createdAt: string;
}

export interface BoardColumnDto {
  id: string;
  name: string;
  sortOrder: number;
  /** Non-archived leads in the column, before the current filters. */
  total: number;
  leads: LeadDto[];
}

export interface BoardViewDto {
  boards: LeadBoardDto[];
  board: LeadBoardDto | null;
  columns: BoardColumnDto[];
}

export interface LeadOptions {
  teachers: Array<{ id: string; fullName: string }>;
  sources: Array<{ id: string; name: string }>;
  /** Distinct "HH:mm" values from group schedules and existing leads. */
  lessonTimes: string[];
  groups: Array<{ id: string; name: string; branchId: string }>;
  boards: Array<{
    id: string;
    name: string;
    branchId: string;
    columns: Array<{ id: string; name: string }>;
  }>;
}

const include = {
  phones: { orderBy: { sortOrder: "asc" } },
  source: { select: { name: true } },
  teacher: { select: { fullName: true } },
  form: { select: { name: true } },
} satisfies Prisma.LeadInclude;
type Row = Prisma.LeadGetPayload<{ include: typeof include }>;

function toDto(row: Row): LeadDto {
  return {
    id: row.id,
    branchId: row.branchId,
    boardId: row.boardId,
    columnId: row.columnId,
    fullName: row.fullName,
    phones: row.phones.map((p) => p.phone),
    birthDate: row.birthDate ? dateToIso(row.birthDate) : null,
    age: row.age,
    sourceId: row.sourceId,
    sourceName: row.source?.name ?? null,
    teacherId: row.teacherId,
    teacherName: row.teacher?.fullName ?? null,
    days: row.days,
    lessonTime: row.lessonTime,
    status: row.status,
    temperature: row.temperature,
    comment: row.comment,
    sortOrder: row.sortOrder,
    isArchived: row.isArchived,
    studentId: row.studentId,
    convertedAt: row.convertedAt?.toISOString() ?? null,
    formName: row.form?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function filterWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  return {
    isArchived: filters.archived ?? false,
    ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
    ...(filters.lessonTime ? { lessonTime: filters.lessonTime } : {}),
    ...(filters.days ? { days: filters.days } : {}),
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: "insensitive" } },
            { comment: { contains: filters.q, mode: "insensitive" } },
            { phones: { some: { phone: { contains: filters.q.replace(/[\s()-]/g, "") } } } },
          ],
        }
      : {}),
  };
}

/** The board page: every board in scope, the chosen one and its columns with filtered leads. */
export async function getBoardView(
  actor: Actor,
  filters: LeadFilters = {},
  db: DbClient = prisma,
): Promise<BoardViewDto> {
  authorize(actor, "leads.view");
  const boards = await listBoards(actor, db);
  const board = filters.boardId
    ? (boards.find((b) => b.id === filters.boardId) ?? null)
    : (boards[0] ?? null);
  if (filters.boardId && !board) throw AppError.notFound("errors.boardNotFound");
  if (!board) return { boards, board: null, columns: [] };
  const columns = await db.leadColumn.findMany({
    where: { boardId: board.id },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { leads: { where: { isArchived: false } } } },
      leads: {
        where: filterWhere(filters),
        include,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  return {
    boards,
    board,
    columns: columns.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      total: c._count.leads,
      leads: c.leads.map(toDto),
    })),
  };
}

export async function getLeadOptions(actor: Actor, db: DbClient = prisma): Promise<LeadOptions> {
  authorize(actor, "leads.view");
  const organizationId = await getOrganizationId(db);
  const scope = branchScope(actor) ?? {};
  const [teachers, sources, slots, leadTimes, groups, boards] = await Promise.all([
    db.user.findMany({
      where: {
        isArchived: false,
        roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
        ...(Object.keys(scope).length ? { branches: { some: scope } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.leadSource.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.groupScheduleSlot.findMany({
      where: { group: { ...scope, status: { not: "ARCHIVED" } } },
      select: { startTime: true },
      distinct: ["startTime"],
    }),
    db.lead.findMany({
      where: { ...scope, lessonTime: { not: null } },
      select: { lessonTime: true },
      distinct: ["lessonTime"],
    }),
    db.group.findMany({
      where: { ...scope, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.leadBoard.findMany({
      where: scope,
      select: {
        id: true,
        name: true,
        branchId: true,
        columns: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const times = new Set<string>();
  for (const s of slots) times.add(s.startTime);
  for (const l of leadTimes) if (l.lessonTime) times.add(l.lessonTime);
  return { teachers, sources, lessonTimes: [...times].sort(), groups, boards };
}

async function findLeadInScope(db: DbClient, actor: Actor, id: string): Promise<Row> {
  const row = await mustFind(db.lead.findUnique({ where: { id }, include }), "errors.leadNotFound");
  assertBranch(actor, row.branchId);
  return row;
}

async function assertTeacherInBranch(db: DbClient, teacherId: string, branchId: string) {
  const ok = await db.user.count({
    where: {
      id: teacherId,
      isArchived: false,
      roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
      branches: { some: { branchId } },
    },
  });
  if (ok === 0) throw AppError.validation({ teacherId: ["validation.teacherUnknown"] });
}

function leadData(input: LeadUpdateInput): Prisma.LeadUpdateInput {
  return {
    ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
    ...(input.birthDate !== undefined
      ? { birthDate: input.birthDate ? isoToDate(input.birthDate) : null }
      : {}),
    ...(input.age !== undefined ? { age: input.age } : {}),
    ...(input.sourceId !== undefined
      ? { source: input.sourceId ? { connect: { id: input.sourceId } } : { disconnect: true } }
      : {}),
    ...(input.teacherId !== undefined
      ? { teacher: input.teacherId ? { connect: { id: input.teacherId } } : { disconnect: true } }
      : {}),
    ...(input.days !== undefined ? { days: input.days } : {}),
    ...(input.lessonTime !== undefined ? { lessonTime: input.lessonTime } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
  };
}

const phoneRows = (phones: string[]) => phones.map((phone, i) => ({ phone, sortOrder: i }));

export async function createLead(
  actor: Actor,
  input: LeadInput,
  options: { formId?: string; createdById?: string | null } = {},
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "leads.create");
  const column = await findColumnInScope(db, actor, input.columnId);
  const branchId = column.board.branchId;
  if (input.teacherId) await assertTeacherInBranch(db, input.teacherId, branchId);
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.lead.findFirst({
        where: { columnId: column.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const row = await tx.lead.create({
        data: {
          branchId,
          boardId: column.boardId,
          columnId: column.id,
          fullName: input.fullName,
          birthDate: input.birthDate ? isoToDate(input.birthDate) : null,
          age: input.age ?? null,
          sourceId: input.sourceId ?? null,
          teacherId: input.teacherId ?? null,
          days: input.days ?? null,
          lessonTime: input.lessonTime ?? null,
          status: input.status,
          temperature: input.temperature ?? null,
          comment: input.comment ?? null,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          formId: options.formId ?? null,
          createdById:
            options.createdById === undefined ? actor.userId || null : options.createdById,
          phones: { create: phoneRows(input.phones) },
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "lead.create",
        entity: "Lead",
        entityId: row.id,
        after: dto,
        branchId,
      });
      // AmoCRM sync (A-20): a job per new lead when the integration is switched on.
      const amo = await loadIntegrationConfig(tx, "AMOCRM");
      if (amo?.isEnabled) {
        await enqueue(tx, {
          type: "amocrm.pushLead",
          payload: {
            name: dto.fullName,
            phone: dto.phones[0] ?? null,
            source: dto.sourceName ?? null,
          },
          uniqueKey: `amocrm:lead:${row.id}`,
        });
      }
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "fullName");
  }
}

export async function getLead(actor: Actor, id: string, db: DbClient = prisma): Promise<LeadDto> {
  authorize(actor, "leads.view");
  return toDto(await findLeadInScope(db, actor, id));
}

export async function updateLead(
  actor: Actor,
  id: string,
  input: LeadUpdateInput,
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "leads.update");
  const row = await findLeadInScope(db, actor, id);
  const before = toDto(row);
  let columnMove: Prisma.LeadUpdateInput = {};
  if (input.columnId && input.columnId !== row.columnId) {
    const column = await findColumnInScope(db, actor, input.columnId);
    if (column.board.branchId !== row.branchId) {
      throw AppError.validation({ columnId: ["validation.columnBranch"] });
    }
    columnMove = {
      column: { connect: { id: column.id } },
      board: { connect: { id: column.boardId } },
    };
  }
  if (input.teacherId) await assertTeacherInBranch(db, input.teacherId, row.branchId);
  try {
    return await db.$transaction(async (tx) => {
      if (input.phones !== undefined) {
        await tx.leadPhone.deleteMany({ where: { leadId: id } });
        await tx.leadPhone.createMany({
          data: phoneRows(input.phones).map((p) => ({ ...p, leadId: id })),
        });
      }
      const updated = await tx.lead.update({
        where: { id },
        data: { ...leadData(input), ...columnMove },
        include,
      });
      const after = toDto(updated);
      await recordAudit(tx, actor, {
        action: "lead.update",
        entity: "Lead",
        entityId: id,
        before,
        after,
        branchId: row.branchId,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "fullName");
  }
}

/** Drag and drop: the lead lands in `columnId`, before `beforeLeadId` or at the end. */
export async function moveLead(
  actor: Actor,
  id: string,
  input: LeadMoveInput,
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "leads.update");
  const row = await findLeadInScope(db, actor, id);
  const column = await findColumnInScope(db, actor, input.columnId);
  if (column.board.branchId !== row.branchId) {
    throw AppError.validation({ columnId: ["validation.columnBranch"] });
  }
  return db.$transaction(async (tx) => {
    const siblings = await tx.lead.findMany({
      where: { columnId: column.id, isArchived: row.isArchived, id: { not: id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const at = input.beforeLeadId ? ids.indexOf(input.beforeLeadId) : -1;
    if (at === -1) ids.push(id);
    else ids.splice(at, 0, id);
    for (const [sortOrder, leadId] of ids.entries()) {
      await tx.lead.update({
        where: { id: leadId },
        data:
          leadId === id
            ? { sortOrder, columnId: column.id, boardId: column.boardId }
            : { sortOrder },
      });
    }
    const updated = await tx.lead.findUniqueOrThrow({ where: { id }, include });
    if (row.columnId !== column.id) {
      await recordAudit(tx, actor, {
        action: "lead.move",
        entity: "Lead",
        entityId: id,
        before: { columnId: row.columnId },
        after: { columnId: column.id },
        branchId: row.branchId,
      });
    }
    return toDto(updated);
  });
}

export async function setLeadArchived(
  actor: Actor,
  id: string,
  archived: boolean,
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "leads.update");
  const row = await findLeadInScope(db, actor, id);
  return db.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id },
      data: { isArchived: archived },
      include,
    });
    await recordAudit(tx, actor, {
      action: archived ? "lead.archive" : "lead.restore",
      entity: "Lead",
      entityId: id,
      before: { isArchived: row.isArchived },
      after: { isArchived: archived },
      branchId: row.branchId,
    });
    return toDto(updated);
  });
}

export async function deleteLead(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "leads.delete");
  const row = await findLeadInScope(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.lead.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "lead.delete",
      entity: "Lead",
      entityId: id,
      before: toDto(row),
      branchId: row.branchId,
    });
  });
}

export interface LeadsToGroupResult {
  added: number;
  /** Leads skipped because their student already belongs to the group. */
  skipped: number;
}

/**
 * "LIDLARNI GURUHGA QO'SHISH": each lead becomes a student of the group (A-68).
 * A lead that came back from a group keeps its student record; the others get a
 * new student in the group's branch with the lead's first phone and source.
 * Converted leads are archived and keep a link to the student.
 */
export async function addLeadsToGroup(
  actor: Actor,
  input: LeadsToGroupInput,
  db: DbClient = prisma,
): Promise<LeadsToGroupResult> {
  authorize(actor, "leads.update");
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, input.groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const leads = await db.lead.findMany({
    where: { id: { in: input.leadIds }, ...leadScope(actor) },
    include: {
      ...include,
      student: { select: { id: true, isArchived: true, isBlacklisted: true } },
    },
  });
  if (leads.length !== input.leadIds.length) throw AppError.notFound("errors.leadNotFound");
  const newStudents = leads.filter((l) => !l.student || l.student.isArchived);
  if (newStudents.length > 0) authorize(actor, "students.create");
  const joinedAt = isoToDate(input.joinedAt);
  return db.$transaction(async (tx) => {
    let added = 0;
    let skipped = 0;
    for (const lead of leads) {
      let studentId = lead.student && !lead.student.isArchived ? lead.student.id : null;
      if (lead.student?.isBlacklisted) throw AppError.conflict("errors.studentBlacklisted");
      let membershipId: string;
      if (!studentId) {
        const student = await tx.student.create({
          data: {
            branchId: group.branchId,
            fullName: lead.fullName,
            phone: lead.phones[0]?.phone ?? null,
            birthDate: lead.birthDate,
            sourceId: lead.sourceId,
            note: lead.comment,
          },
        });
        studentId = student.id;
        await recordAudit(tx, actor, {
          action: "student.create",
          entity: "Student",
          entityId: student.id,
          after: { fullName: student.fullName, phone: student.phone, fromLeadId: lead.id },
          branchId: group.branchId,
        });
      }
      // One membership row per student and group: an open one means "already there",
      // a closed one (left earlier, returned to leads) is reopened from the new date.
      const existing = await tx.groupMembership.findUnique({
        where: { groupId_studentId: { groupId: group.id, studentId } },
      });
      if (existing && !["ARCHIVED", "GRADUATED"].includes(existing.status)) {
        skipped += 1;
        continue;
      }
      const data = {
        status: input.status,
        joinedAt,
        activatedAt: input.status === "ACTIVE" ? joinedAt : null,
        leftAt: null,
        leaveReason: null,
        frozenAt: null,
      };
      if (existing) {
        await tx.groupMembership.update({ where: { id: existing.id }, data });
        membershipId = existing.id;
      } else {
        const membership = await tx.groupMembership.create({
          data: { groupId: group.id, studentId, ...data },
        });
        membershipId = membership.id;
      }
      await recordAudit(tx, actor, {
        action: existing ? "membership.update" : "membership.create",
        entity: "GroupMembership",
        entityId: membershipId,
        before: existing ? { status: existing.status } : undefined,
        after: {
          studentId,
          groupId: group.id,
          status: input.status,
          joinedAt: input.joinedAt,
          fromLeadId: lead.id,
        },
        branchId: group.branchId,
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { studentId, convertedAt: new Date(), isArchived: true },
      });
      await recordAudit(tx, actor, {
        action: "lead.convert",
        entity: "Lead",
        entityId: lead.id,
        after: { studentId, groupId: group.id },
        branchId: lead.branchId,
      });
      added += 1;
    }
    return { added, skipped };
  });
}

/**
 * "Lidlarga qaytarish" (EXP §5 row menu): the membership ends today with the
 * given reason and the student reappears as a lead on the branch's board (A-08).
 */
export async function returnToLeads(
  actor: Actor,
  membershipId: string,
  input: ToLeadInput,
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "groups.update");
  authorize(actor, "leads.create");
  const membership = await mustFind(
    db.groupMembership.findUnique({
      where: { id: membershipId },
      include: { student: true, group: { select: { id: true, name: true, branchId: true } } },
    }),
    "errors.memberUnknown",
  );
  await findGroupInScope(db, actor, membership.group.id, {});
  if (membership.status === "ARCHIVED" || membership.status === "GRADUATED") {
    throw AppError.conflict("errors.memberLeft");
  }
  const branchId = membership.group.branchId;
  let target: { boardId: string; columnId: string };
  if (input.columnId) {
    const column = await findColumnInScope(db, actor, input.columnId);
    if (column.board.branchId !== branchId) {
      throw AppError.validation({ columnId: ["validation.columnBranch"] });
    }
    target = { boardId: column.boardId, columnId: column.id };
  } else if (input.boardId) {
    const board = await findBoardInScope(db, actor, input.boardId);
    if (board.branchId !== branchId)
      throw AppError.validation({ boardId: ["validation.columnBranch"] });
    const first = await mustFind(
      db.leadColumn.findFirst({ where: { boardId: board.id }, orderBy: { sortOrder: "asc" } }),
      "errors.columnNotFound",
    );
    target = { boardId: board.id, columnId: first.id };
  } else {
    target = await defaultColumnForBranch(db, branchId);
  }
  const now = isoToDate(today());
  return db.$transaction(async (tx) => {
    const closed = await tx.groupMembership.update({
      where: { id: membershipId },
      data: { status: "ARCHIVED", leftAt: now, leaveReason: input.reason ?? "returnedToLeads" },
    });
    await recordAudit(tx, actor, {
      action: "membership.toLead",
      entity: "GroupMembership",
      entityId: membershipId,
      before: { status: membership.status },
      after: { status: closed.status, leftAt: dateToIso(now), leaveReason: closed.leaveReason },
      branchId,
    });
    const last = await tx.lead.findFirst({
      where: { columnId: target.columnId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const lead = await tx.lead.create({
      data: {
        branchId,
        boardId: target.boardId,
        columnId: target.columnId,
        fullName: membership.student.fullName,
        birthDate: membership.student.birthDate,
        sourceId: membership.student.sourceId,
        status: "NEW",
        comment: input.reason ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        studentId: membership.student.id,
        createdById: actor.userId || null,
        phones: membership.student.phone
          ? { create: [{ phone: membership.student.phone, sortOrder: 0 }] }
          : undefined,
      },
      include,
    });
    const dto = toDto(lead);
    await recordAudit(tx, actor, {
      action: "lead.create",
      entity: "Lead",
      entityId: lead.id,
      after: { ...dto, fromMembershipId: membershipId, fromGroupId: membership.group.id },
      branchId,
    });
    return dto;
  });
}
