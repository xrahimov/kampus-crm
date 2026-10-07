import type { BranchInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, authorizeAny, type Actor } from "@/server/rbac/authorize";

import { mustFind } from "./shared";

export interface BranchDto {
  id: string;
  name: string;
  isActive: boolean;
}

const select = { id: true, name: true, isActive: true } as const;

/** Every settings user needs the branch list (course and room forms pick one). */
export async function listBranches(actor: Actor, db: DbClient = prisma): Promise<BranchDto[]> {
  authorizeAny(actor, ["settings.org", "settings.catalog"]);
  const organizationId = actor.organizationId;
  return db.branch.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select });
}

export async function createBranch(
  actor: Actor,
  input: BranchInput,
  db: DbClient = prisma,
): Promise<BranchDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  return db.$transaction(async (tx) => {
    const branch = await tx.branch.create({ data: { organizationId, ...input }, select });
    await recordAudit(tx, actor, {
      action: "branch.create",
      entity: "Branch",
      entityId: branch.id,
      after: branch,
      branchId: branch.id,
    });
    return branch;
  });
}

export async function updateBranch(
  actor: Actor,
  id: string,
  input: Partial<BranchInput>,
  db: DbClient = prisma,
): Promise<BranchDto> {
  authorize(actor, "settings.org");
  return db.$transaction(async (tx) => {
    const before = await mustFind(tx.branch.findUnique({ where: { id }, select }));
    const after = await tx.branch.update({ where: { id }, data: input, select });
    await recordAudit(tx, actor, {
      action: "branch.update",
      entity: "Branch",
      entityId: id,
      before,
      after,
      branchId: id,
    });
    return after;
  });
}

/**
 * Branches are never deleted: staff, groups and payments point at them.
 * "Delete" deactivates, which hides the branch from every selector.
 */
export async function deactivateBranch(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  await updateBranch(actor, id, { isActive: false }, db);
}
