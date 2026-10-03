import type { ReceiptSettingsInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { DEFAULT_RECEIPT_FIELDS } from "@/server/services/students/payments.service";

import { getOrganizationId } from "./shared";

/* "Chek sozlamalari" (EXP §8): address, phone, visible parts, logo position, footer. */

export interface ReceiptSettingsDto extends ReceiptSettingsInput {
  organizationName: string;
  logoUrl: string | null;
}

export async function getReceiptSettings(
  actor: Actor,
  db: DbClient = prisma,
): Promise<ReceiptSettingsDto> {
  authorize(actor, "settings.org");
  const organizationId = await getOrganizationId(db);
  const [org, row] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    }),
    db.receiptSettings.findUnique({ where: { organizationId } }),
  ]);
  return {
    organizationName: org.name,
    logoUrl: org.logoUrl,
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    visibleFields: (row?.visibleFields ??
      DEFAULT_RECEIPT_FIELDS) as ReceiptSettingsInput["visibleFields"],
    logoPosition: row?.logoPosition ?? "TOP",
    footerText: row?.footerText ?? null,
  };
}

export async function updateReceiptSettings(
  actor: Actor,
  input: ReceiptSettingsInput,
  db: DbClient = prisma,
): Promise<ReceiptSettingsDto> {
  authorize(actor, "settings.org");
  const organizationId = await getOrganizationId(db);
  const before = await getReceiptSettings(actor, db);
  const data = {
    address: input.address ?? null,
    phone: input.phone ?? null,
    visibleFields: input.visibleFields,
    logoPosition: input.logoPosition,
    footerText: input.footerText ?? null,
  };
  await db.$transaction(async (tx) => {
    await tx.receiptSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
    await recordAudit(tx, actor, {
      action: "receiptSettings.update",
      entity: "Organization",
      entityId: organizationId,
      before: {
        address: before.address,
        phone: before.phone,
        visibleFields: before.visibleFields,
        logoPosition: before.logoPosition,
        footerText: before.footerText,
      },
      after: data,
      branchId: null,
    });
  });
  return getReceiptSettings(actor, db);
}
