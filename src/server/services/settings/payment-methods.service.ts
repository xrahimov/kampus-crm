import type { PaymentMethodInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";

import { mustFind, rethrowAsAppError } from "./shared";

export interface PaymentMethodDto {
  id: string;
  name: string;
  isActive: boolean;
  /** Counted at the cashier's day close (A-122). */
  isCash: boolean;
  sortOrder: number;
}

const select = { id: true, name: true, isActive: true, isCash: true, sortOrder: true } as const;

export async function listPaymentMethods(
  actor: Actor,
  db: DbClient = prisma,
): Promise<PaymentMethodDto[]> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  return db.paymentMethod.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select,
  });
}

export async function createPaymentMethod(
  actor: Actor,
  input: PaymentMethodInput,
  db: DbClient = prisma,
): Promise<PaymentMethodDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const method = await tx.paymentMethod.create({ data: { organizationId, ...input }, select });
      await recordAudit(tx, actor, {
        action: "paymentMethod.create",
        entity: "PaymentMethod",
        entityId: method.id,
        after: method,
        branchId: null,
      });
      return method;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updatePaymentMethod(
  actor: Actor,
  id: string,
  input: Partial<PaymentMethodInput>,
  db: DbClient = prisma,
): Promise<PaymentMethodDto> {
  authorize(actor, "settings.org");
  try {
    return await db.$transaction(async (tx) => {
      const before = await mustFind(
        tx.paymentMethod.findFirst({ where: { id, organizationId: actor.organizationId }, select }),
      );
      const after = await tx.paymentMethod.update({ where: { id }, data: input, select });
      await recordAudit(tx, actor, {
        action: "paymentMethod.update",
        entity: "PaymentMethod",
        entityId: id,
        before,
        after,
        branchId: null,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deletePaymentMethod(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.org");
  try {
    await db.$transaction(async (tx) => {
      const before = await mustFind(
        tx.paymentMethod.findFirst({ where: { id, organizationId: actor.organizationId }, select }),
      );
      await tx.paymentMethod.delete({ where: { id } });
      await recordAudit(tx, actor, {
        action: "paymentMethod.delete",
        entity: "PaymentMethod",
        entityId: id,
        before,
        branchId: null,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}
