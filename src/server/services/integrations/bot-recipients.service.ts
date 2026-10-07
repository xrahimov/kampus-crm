import type { BotRecipientInput } from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { enqueue } from "@/server/jobs/queue";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";

/* Settings → "Bot xabarnoma" (EXP §8): staff who get Telegram notifications. A-85. */

export interface BotRecipientDto {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  chatId: string;
  branchIds: string[];
  branchNames: string[];
  createdAt: string;
}

export async function listBotRecipients(
  actor: Actor,
  db: DbClient = prisma,
): Promise<BotRecipientDto[]> {
  authorize(actor, "settings.integrations");
  const organizationId = actor.organizationId;
  const [rows, branches] = await Promise.all([
    db.botRecipient.findMany({
      where: { organizationId },
      include: { user: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.branch.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    fullName: r.user.fullName,
    phone: r.user.phone,
    chatId: r.chatId,
    branchIds: r.branchIds,
    branchNames: r.branchIds.map((id) => branchName.get(id) ?? "?"),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function createBotRecipient(
  actor: Actor,
  input: BotRecipientInput,
  db: DbClient = prisma,
): Promise<BotRecipientDto> {
  authorize(actor, "settings.integrations");
  const organizationId = actor.organizationId;
  await mustFind(
    db.user.findFirst({ where: { id: input.userId, isArchived: false } }),
    "errors.staffNotFound",
  );
  const known = await db.branch.count({ where: { id: { in: input.branchIds }, organizationId } });
  if (known !== input.branchIds.length) {
    throw AppError.validation({ branchIds: ["validation.branchUnknown"] });
  }
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.botRecipient.create({
        data: {
          organizationId,
          userId: input.userId,
          chatId: input.chatId,
          branchIds: input.branchIds,
        },
      });
      await recordAudit(tx, actor, {
        action: "botRecipient.create",
        entity: "BotRecipient",
        entityId: row.id,
        after: { userId: row.userId, branchIds: row.branchIds },
        branchId: null,
      });
      const dto = (await listBotRecipients(actor, tx)).find((r) => r.id === row.id);
      if (!dto) throw new AppError("INTERNAL", "errors.internal");
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "userId");
  }
}

export async function deleteBotRecipient(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.integrations");
  const row = await mustFind(
    db.botRecipient.findFirst({ where: { id, organizationId: actor.organizationId } }),
  );
  await db.$transaction(async (tx) => {
    await tx.botRecipient.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "botRecipient.delete",
      entity: "BotRecipient",
      entityId: id,
      before: { userId: row.userId, branchIds: row.branchIds },
      branchId: null,
    });
  });
}

/**
 * Queues a Telegram message to every recipient who listens to `branchId`
 * (empty branch list = everything). Called inside the transaction of the event.
 */
export async function notifyStaff(
  tx: DbClient,
  input: { organizationId: string; branchId: string | null; text: string },
): Promise<number> {
  const recipients = await tx.botRecipient.findMany({
    where: { organizationId: input.organizationId },
  });
  let queued = 0;
  for (const r of recipients) {
    if (r.branchIds.length > 0 && (!input.branchId || !r.branchIds.includes(input.branchId))) {
      continue;
    }
    await enqueue(tx, {
      type: "telegram.send",
      payload: { organizationId: input.organizationId, chatId: r.chatId, text: input.text },
    });
    queued += 1;
  }
  return queued;
}
