import type { LeadBoardInput, LeadColumnInput } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";

import { assertBranch, boardScope, findBoardInScope, findColumnInScope } from "./shared";

/* Boards ("Website") and their columns ("Bo'lim") — EXP §2. */

export interface LeadBoardDto {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  /** Leads on the board that are not archived. */
  leadCount: number;
}

export interface LeadColumnDto {
  id: string;
  boardId: string;
  name: string;
  sortOrder: number;
}

export async function listBoards(actor: Actor, db: DbClient = prisma): Promise<LeadBoardDto[]> {
  authorize(actor, "leads.view");
  const rows = await db.leadBoard.findMany({
    where: boardScope(actor),
    include: {
      branch: { select: { name: true } },
      _count: { select: { leads: { where: { isArchived: false } } } },
    },
    orderBy: [{ branch: { name: "asc" } }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    branchId: b.branchId,
    branchName: b.branch.name,
    name: b.name,
    leadCount: b._count.leads,
  }));
}

/** Every column in the actor's branches as "Branch · Board · Column", for settings that pick one (A-115). */
export async function listColumnOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<Array<{ id: string; label: string }>> {
  authorize(actor, "settings.integrations");
  const rows = await db.leadColumn.findMany({
    where: { board: boardScope(actor) },
    include: { board: { select: { name: true, branch: { select: { name: true } } } } },
    orderBy: [
      { board: { branch: { name: "asc" } } },
      { board: { sortOrder: "asc" } },
      { board: { createdAt: "asc" } },
      { sortOrder: "asc" },
    ],
  });
  return rows.map((c) => ({
    id: c.id,
    label: `${c.board.branch.name} · ${c.board.name} · ${c.name}`,
  }));
}

export async function createBoard(
  actor: Actor,
  input: LeadBoardInput & { branchId: string },
  db: DbClient = prisma,
): Promise<LeadBoardDto> {
  authorize(actor, "leads.update");
  assertBranch(actor, input.branchId);
  const branch = await mustFind(
    db.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true } }),
    "errors.branchNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.leadBoard.findFirst({
        where: { branchId: branch.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const row = await tx.leadBoard.create({
        data: {
          branchId: branch.id,
          name: input.name,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          columns: { create: { name: "NEW LEADS", sortOrder: 0 } },
        },
      });
      await recordAudit(tx, actor, {
        action: "leadBoard.create",
        entity: "LeadBoard",
        entityId: row.id,
        after: { name: row.name, branchId: row.branchId },
        branchId: row.branchId,
      });
      return {
        id: row.id,
        branchId: row.branchId,
        branchName: branch.name,
        name: row.name,
        leadCount: 0,
      };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateBoard(
  actor: Actor,
  id: string,
  input: LeadBoardInput,
  db: DbClient = prisma,
): Promise<LeadBoardDto> {
  authorize(actor, "leads.update");
  const board = await findBoardInScope(db, actor, id);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leadBoard.update({
        where: { id },
        data: { name: input.name },
        include: { _count: { select: { leads: { where: { isArchived: false } } } } },
      });
      await recordAudit(tx, actor, {
        action: "leadBoard.update",
        entity: "LeadBoard",
        entityId: id,
        before: { name: board.name },
        after: { name: row.name },
        branchId: board.branchId,
      });
      return {
        id: row.id,
        branchId: row.branchId,
        branchName: board.branch.name,
        name: row.name,
        leadCount: row._count.leads,
      };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** A board with leads (even archived ones) cannot be deleted; move or delete them first. */
export async function deleteBoard(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "leads.delete");
  const board = await findBoardInScope(db, actor, id);
  const leads = await db.lead.count({ where: { boardId: id } });
  if (leads > 0) throw AppError.conflict("errors.boardHasLeads");
  const forms = await db.leadForm.count({ where: { column: { boardId: id } } });
  if (forms > 0) throw AppError.conflict("errors.inUse");
  await db.$transaction(async (tx) => {
    await tx.leadBoard.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "leadBoard.delete",
      entity: "LeadBoard",
      entityId: id,
      before: { name: board.name, branchId: board.branchId },
      branchId: board.branchId,
    });
  });
}

export async function createColumn(
  actor: Actor,
  boardId: string,
  input: LeadColumnInput,
  db: DbClient = prisma,
): Promise<LeadColumnDto> {
  authorize(actor, "leads.update");
  const board = await findBoardInScope(db, actor, boardId);
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.leadColumn.findFirst({
        where: { boardId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const row = await tx.leadColumn.create({
        data: { boardId, name: input.name, sortOrder: (last?.sortOrder ?? -1) + 1 },
      });
      await recordAudit(tx, actor, {
        action: "leadColumn.create",
        entity: "LeadColumn",
        entityId: row.id,
        after: { name: row.name, boardId },
        branchId: board.branchId,
      });
      return { id: row.id, boardId, name: row.name, sortOrder: row.sortOrder };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateColumn(
  actor: Actor,
  id: string,
  input: LeadColumnInput,
  db: DbClient = prisma,
): Promise<LeadColumnDto> {
  authorize(actor, "leads.update");
  const column = await findColumnInScope(db, actor, id);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leadColumn.update({ where: { id }, data: { name: input.name } });
      await recordAudit(tx, actor, {
        action: "leadColumn.update",
        entity: "LeadColumn",
        entityId: id,
        before: { name: column.name },
        after: { name: row.name },
        branchId: column.board.branchId,
      });
      return { id: row.id, boardId: row.boardId, name: row.name, sortOrder: row.sortOrder };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** The last column of a board, or one that still holds leads or receives a form, stays. */
export async function deleteColumn(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "leads.update");
  const column = await findColumnInScope(db, actor, id);
  const [siblings, leads, forms] = await Promise.all([
    db.leadColumn.count({ where: { boardId: column.boardId } }),
    db.lead.count({ where: { columnId: id } }),
    db.leadForm.count({ where: { columnId: id } }),
  ]);
  if (siblings <= 1) throw AppError.conflict("errors.lastColumn");
  if (leads > 0) throw AppError.conflict("errors.columnHasLeads");
  if (forms > 0) throw AppError.conflict("errors.inUse");
  await db.$transaction(async (tx) => {
    await tx.leadColumn.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "leadColumn.delete",
      entity: "LeadColumn",
      entityId: id,
      before: { name: column.name, boardId: column.boardId },
      branchId: column.board.branchId,
    });
  });
}
