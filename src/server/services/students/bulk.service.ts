import type { BulkStudentsInput } from "@/lib/validation/students";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { addMember } from "@/server/services/groups/memberships.service";
import { findGroupInScope } from "@/server/services/groups/shared";

import { giveDiscount } from "./discounts.service";
import { archiveStudent, restoreStudent, studentScope } from "./students.service";

/*
 * Bulk actions on the students list (A-132): the ticked students join a group,
 * get a discount, go to the archive or come back from it together. Each student
 * goes through the same service as the single action would, so the audit log,
 * referral credits, family discounts and auto-SMS are exactly those of doing it
 * one by one. A student the action does not apply to is skipped, not an error.
 */

export interface BulkResult {
  done: number;
  /** Students the action did not apply to: already in the group, no membership there, out of scope. */
  skipped: number;
}

const OPEN = ["NEW", "TRIAL", "ACTIVE", "FROZEN"] as const;

export async function bulkStudents(
  actor: Actor,
  input: BulkStudentsInput,
  db: DbClient = prisma,
): Promise<BulkResult> {
  const inScope = await db.student.findMany({
    where: { id: { in: input.studentIds }, ...studentScope(actor) },
    select: { id: true, isArchived: true },
  });
  const outOfScope = input.studentIds.length - inScope.length;
  let done = 0;
  let skipped = outOfScope;

  switch (input.action) {
    case "archive": {
      authorize(actor, "students.delete");
      for (const s of inScope) {
        if (s.isArchived) {
          skipped += 1;
          continue;
        }
        await archiveStudent(actor, s.id, db);
        done += 1;
      }
      break;
    }
    case "restore": {
      authorize(actor, "students.delete");
      for (const s of inScope) {
        if (!s.isArchived) {
          skipped += 1;
          continue;
        }
        await restoreStudent(actor, s.id, db);
        done += 1;
      }
      break;
    }
    case "addToGroup": {
      authorize(actor, "groups.update");
      const group = await findGroupInScope(db, actor, input.groupId, {});
      if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
      const members = await db.groupMembership.findMany({
        where: { groupId: group.id, studentId: { in: inScope.map((s) => s.id) } },
        select: { studentId: true, status: true },
      });
      for (const s of inScope) {
        const existing = members.find((m) => m.studentId === s.id);
        if (s.isArchived || (existing && (OPEN as readonly string[]).includes(existing.status))) {
          skipped += 1;
          continue;
        }
        if (existing) {
          // Left earlier: the single action would refuse a second row, so the bulk one skips too.
          skipped += 1;
          continue;
        }
        await addMember(
          actor,
          group.id,
          { studentId: s.id, joinedAt: input.joinedAt, status: input.status },
          db,
        );
        done += 1;
      }
      break;
    }
    case "discount": {
      authorize(actor, "discounts.give");
      await findGroupInScope(db, actor, input.groupId, {});
      const members = await db.groupMembership.findMany({
        where: {
          groupId: input.groupId,
          studentId: { in: inScope.map((s) => s.id) },
          status: { in: [...OPEN] },
        },
        select: { id: true, studentId: true },
      });
      for (const s of inScope) {
        const m = members.find((x) => x.studentId === s.id);
        if (!m) {
          skipped += 1;
          continue;
        }
        try {
          await giveDiscount(
            actor,
            {
              membershipId: m.id,
              discountedPrice: input.discountedPrice,
              months: input.months,
              comment: input.comment ?? null,
            },
            undefined,
            db,
          );
          done += 1;
        } catch (e) {
          // The discounted price is not below this student's own price: nothing to give.
          if (e instanceof AppError && e.code === "VALIDATION") skipped += 1;
          else throw e;
        }
      }
      break;
    }
  }
  return { done, skipped };
}
