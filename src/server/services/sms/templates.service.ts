import type { SmsCategoryInput, SmsTemplateInput } from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { getSmsProvider } from "@/server/services/integrations/integrations.service";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";

/* Settings → "SMS shablonlari" (EXP §8): categories and templates. A-84. */

export interface SmsCategoryDto {
  id: string;
  name: string;
  templatesCount: number;
}

export interface SmsTemplateDto {
  id: string;
  categoryId: string;
  categoryName: string;
  text: string;
  imported: boolean;
  createdAt: string;
}

export async function listSmsCategories(
  actor: Actor,
  db: DbClient = prisma,
): Promise<SmsCategoryDto[]> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  const rows = await db.smsCategory.findMany({
    where: { organizationId },
    include: { _count: { select: { templates: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, templatesCount: r._count.templates }));
}

export async function createSmsCategory(
  actor: Actor,
  input: SmsCategoryInput,
  db: DbClient = prisma,
): Promise<SmsCategoryDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.smsCategory.create({ data: { organizationId, name: input.name } });
      await recordAudit(tx, actor, {
        action: "smsCategory.create",
        entity: "SmsCategory",
        entityId: row.id,
        after: { name: row.name },
        branchId: null,
      });
      return { id: row.id, name: row.name, templatesCount: 0 };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteSmsCategory(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.catalog");
  const row = await mustFind(
    db.smsCategory.findFirst({
      where: { id, organizationId: actor.organizationId },
      include: { _count: { select: { templates: true } } },
    }),
    "errors.categoryNotFound",
  );
  if (row._count.templates > 0) throw AppError.conflict("errors.categoryHasTemplates");
  await db.$transaction(async (tx) => {
    await tx.smsCategory.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "smsCategory.delete",
      entity: "SmsCategory",
      entityId: id,
      before: { name: row.name },
      branchId: null,
    });
  });
}

const include = { category: { select: { name: true } } } as const;

function toDto(row: {
  id: string;
  categoryId: string;
  text: string;
  providerId: string | null;
  createdAt: Date;
  category: { name: string };
}): SmsTemplateDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    text: row.text,
    imported: row.providerId !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Anyone who can send an SMS may read the templates (the send dialog offers them). */
export async function listSmsTemplates(
  actor: Actor,
  filters: { categoryId?: string } = {},
  db: DbClient = prisma,
): Promise<SmsTemplateDto[]> {
  authorize(actor, "sms.send");
  const organizationId = actor.organizationId;
  const rows = await db.smsTemplate.findMany({
    where: { organizationId, ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) },
    include,
    orderBy: [{ category: { name: "asc" } }, { createdAt: "asc" }],
  });
  return rows.map(toDto);
}

async function checkCategory(db: DbClient, organizationId: string, categoryId: string) {
  const found = await db.smsCategory.count({ where: { id: categoryId, organizationId } });
  if (found === 0) throw AppError.validation({ categoryId: ["validation.categoryUnknown"] });
}

export async function createSmsTemplate(
  actor: Actor,
  input: SmsTemplateInput,
  db: DbClient = prisma,
): Promise<SmsTemplateDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  await checkCategory(db, organizationId, input.categoryId);
  return db.$transaction(async (tx) => {
    const row = await tx.smsTemplate.create({
      data: { organizationId, categoryId: input.categoryId, text: input.text },
      include,
    });
    await recordAudit(tx, actor, {
      action: "smsTemplate.create",
      entity: "SmsTemplate",
      entityId: row.id,
      after: { categoryId: row.categoryId, text: row.text },
      branchId: null,
    });
    return toDto(row);
  });
}

export async function updateSmsTemplate(
  actor: Actor,
  id: string,
  input: SmsTemplateInput,
  db: DbClient = prisma,
): Promise<SmsTemplateDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  const before = await mustFind(
    db.smsTemplate.findFirst({ where: { id, organizationId: actor.organizationId }, include }),
  );
  await checkCategory(db, organizationId, input.categoryId);
  return db.$transaction(async (tx) => {
    const row = await tx.smsTemplate.update({
      where: { id },
      data: { categoryId: input.categoryId, text: input.text },
      include,
    });
    await recordAudit(tx, actor, {
      action: "smsTemplate.update",
      entity: "SmsTemplate",
      entityId: id,
      before: { categoryId: before.categoryId, text: before.text },
      after: { categoryId: row.categoryId, text: row.text },
      branchId: null,
    });
    return toDto(row);
  });
}

export async function deleteSmsTemplate(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.catalog");
  const before = await mustFind(
    db.smsTemplate.findFirst({ where: { id, organizationId: actor.organizationId } }),
  );
  await db.$transaction(async (tx) => {
    await tx.smsTemplate.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "smsTemplate.delete",
      entity: "SmsTemplate",
      entityId: id,
      before: { categoryId: before.categoryId, text: before.text },
      branchId: null,
    });
  });
}

/**
 * "Eskizdan import qilish": copies the provider's templates into a category,
 * skipping the ones already imported (by provider id).
 */
export async function importProviderTemplates(
  actor: Actor,
  categoryId: string,
  db: DbClient = prisma,
): Promise<{ imported: number; adapter: string }> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  await checkCategory(db, organizationId, categoryId);
  const provider = await getSmsProvider(db);
  let remote: Array<{ id: string; text: string }>;
  try {
    remote = await provider.listTemplates();
  } catch (error) {
    throw new AppError("CONFLICT", "errors.integration", {
      meta: { detail: error instanceof Error ? error.message : String(error) },
    });
  }
  const existing = new Set(
    (
      await db.smsTemplate.findMany({
        where: { organizationId, providerId: { not: null } },
        select: { providerId: true },
      })
    ).map((t) => t.providerId),
  );
  const fresh = remote.filter((t) => !existing.has(`${provider.name}:${t.id}`));
  if (fresh.length === 0) return { imported: 0, adapter: provider.name };
  await db.$transaction(async (tx) => {
    await tx.smsTemplate.createMany({
      data: fresh.map((t) => ({
        organizationId,
        categoryId,
        text: t.text,
        providerId: `${provider.name}:${t.id}`,
      })),
    });
    await recordAudit(tx, actor, {
      action: "smsTemplate.import",
      entity: "SmsCategory",
      entityId: categoryId,
      after: { imported: fresh.length, adapter: provider.name },
      branchId: null,
    });
  });
  return { imported: fresh.length, adapter: provider.name };
}
