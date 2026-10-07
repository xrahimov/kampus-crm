import type { DbClient } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";

export interface AuditEntry {
  action: string; // e.g. "group.update"
  entity: string; // e.g. "Group"
  entityId: string;
  before?: unknown;
  after?: unknown;
  branchId?: string | null;
  /** For entries without an actor (jobs, webhooks): the centre they belong to. */
  organizationId?: string | null;
}

type Json = Parameters<DbClient["auditLog"]["create"]>[0]["data"]["before"];

/** Drops undefined values and Decimal/Date objects become JSON-safe. */
export function toAuditJson(value: unknown): Json {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Json;
}

/**
 * Writes one audit row. Always call it inside the same transaction as the
 * change it records, so a failed change never leaves an orphan audit entry.
 */
export async function recordAudit(
  tx: DbClient,
  actor: Actor | null,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? actor?.organizationId ?? null,
      actorId: actor?.userId ?? null,
      branchId: entry.branchId ?? actor?.activeBranchId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toAuditJson(entry.before),
      after: toAuditJson(entry.after),
      ip: actor?.ip ?? null,
    },
  });
}

/** Field-level diff for "old value → new value" history views (EXP §5 group history). */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): Array<{ field: string; before: unknown; after: unknown }> {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const field of fields) {
    const a = JSON.stringify(before[field] ?? null);
    const b = JSON.stringify(after[field] ?? null);
    if (a !== b) changes.push({ field, before: before[field], after: after[field] });
  }
  return changes;
}
