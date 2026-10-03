import type { LeadSourceInput, SourceStatsFilters } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import {
  getOrganizationId,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";

/* "Manbalar" (EXP §3): the source catalogue and the per-source lead counts. */

export interface LeadSourceDto {
  id: string;
  name: string;
  isActive: boolean;
  /** Leads (archived included) created in the chosen period, inside the actor's branches. */
  leadCount: number;
  /** Students who name this source. */
  studentCount: number;
}

export async function listSources(
  actor: Actor,
  filters: SourceStatsFilters = {},
  db: DbClient = prisma,
): Promise<LeadSourceDto[]> {
  authorize(actor, "leads.view");
  const organizationId = await getOrganizationId(db);
  const scope = branchScope(actor) ?? {};
  const createdAt =
    filters.from || filters.to
      ? {
          ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
          ...(filters.to ? { lt: isoToDate(nextDay(filters.to)) } : {}),
        }
      : undefined;
  const rows = await db.leadSource.findMany({
    where: { organizationId },
    include: {
      _count: {
        select: {
          leads: { where: { ...scope, ...(createdAt ? { createdAt } : {}) } },
          students: { where: { ...scope, isArchived: false } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    leadCount: s._count.leads,
    studentCount: s._count.students,
  }));
}

function nextDay(iso: string): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const select = { id: true, name: true, isActive: true } as const;
const toDto = (row: { id: string; name: string; isActive: boolean }): LeadSourceDto => ({
  ...row,
  leadCount: 0,
  studentCount: 0,
});

export async function createSource(
  actor: Actor,
  input: LeadSourceInput,
  db: DbClient = prisma,
): Promise<LeadSourceDto> {
  authorize(actor, "leads.update");
  const organizationId = await getOrganizationId(db);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leadSource.create({ data: { organizationId, ...input }, select });
      await recordAudit(tx, actor, {
        action: "leadSource.create",
        entity: "LeadSource",
        entityId: row.id,
        after: row,
        branchId: null,
      });
      return toDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateSource(
  actor: Actor,
  id: string,
  input: Partial<LeadSourceInput>,
  db: DbClient = prisma,
): Promise<LeadSourceDto> {
  authorize(actor, "leads.update");
  try {
    return await db.$transaction(async (tx) => {
      const before = await mustFind(tx.leadSource.findUnique({ where: { id }, select }));
      const after = await tx.leadSource.update({ where: { id }, data: input, select });
      await recordAudit(tx, actor, {
        action: "leadSource.update",
        entity: "LeadSource",
        entityId: id,
        before,
        after,
        branchId: null,
      });
      return toDto(after);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** Leads and students keep their rows: the source link is cleared (SetNull). */
export async function deleteSource(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "leads.delete");
  try {
    await db.$transaction(async (tx) => {
      const before = await mustFind(tx.leadSource.findUnique({ where: { id }, select }));
      await tx.leadSource.delete({ where: { id } });
      await recordAudit(tx, actor, {
        action: "leadSource.delete",
        entity: "LeadSource",
        entityId: id,
        before,
        branchId: null,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}
