import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { branchScope, type Actor } from "@/server/rbac/authorize";
import { mustFind } from "@/server/services/settings/shared";

/** Names used when a branch has no board yet (A-67); the UI lets staff rename them. */
export const DEFAULT_BOARD_NAME = "Website";
export const DEFAULT_COLUMN_NAME = "NEW LEADS";

export function leadScope(actor: Actor): Prisma.LeadWhereInput {
  return { ...branchScope(actor) };
}

export function boardScope(actor: Actor): Prisma.LeadBoardWhereInput {
  return { ...branchScope(actor) };
}

export function assertBranch(actor: Actor, branchId: string): void {
  if (!actor.branchIds.includes(branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
}

export async function findBoardInScope(db: DbClient, actor: Actor, id: string) {
  const board = await mustFind(
    db.leadBoard.findUnique({ where: { id }, include: { branch: { select: { name: true } } } }),
    "errors.boardNotFound",
  );
  assertBranch(actor, board.branchId);
  return board;
}

export async function findColumnInScope(db: DbClient, actor: Actor, id: string) {
  const column = await mustFind(
    db.leadColumn.findUnique({ where: { id }, include: { board: true } }),
    "errors.columnNotFound",
  );
  assertBranch(actor, column.board.branchId);
  return column;
}

/** The branch's first board and its first column, created when the branch has none yet. */
export async function defaultColumnForBranch(
  db: DbClient,
  branchId: string,
): Promise<{ boardId: string; columnId: string }> {
  const board = await db.leadBoard.findFirst({
    where: { branchId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { columns: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  if (board?.columns[0]) return { boardId: board.id, columnId: board.columns[0].id };
  if (board) {
    const column = await db.leadColumn.create({
      data: { boardId: board.id, name: DEFAULT_COLUMN_NAME, sortOrder: 0 },
    });
    return { boardId: board.id, columnId: column.id };
  }
  const created = await db.leadBoard.create({
    data: {
      branchId,
      name: DEFAULT_BOARD_NAME,
      columns: { create: { name: DEFAULT_COLUMN_NAME, sortOrder: 0 } },
    },
    include: { columns: true },
  });
  return { boardId: created.id, columnId: created.columns[0]!.id };
}
