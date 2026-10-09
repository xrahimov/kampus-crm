import { ORG_SWITCHES, type OrgSettingsInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { AppError } from "@/server/errors/app-error";
import { rethrowAsAppError } from "@/server/services/settings/shared";

export interface OrgSettingsDto extends OrgSettingsInput {
  organizationId: string;
  logoUrl: string | null;
}

/** Ensures the settings row exists (older databases may predate it). */
async function loadSettings(db: DbClient, organizationId: string) {
  return db.orgSettings.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
}

function toDto(
  org: { id: string; name: string; logoUrl: string | null },
  settings: Awaited<ReturnType<typeof loadSettings>>,
): OrgSettingsDto {
  const switches = Object.fromEntries(ORG_SWITCHES.map((k) => [k, settings[k]])) as Record<
    (typeof ORG_SWITCHES)[number],
    boolean
  >;
  return {
    organizationId: org.id,
    name: org.name,
    logoUrl: org.logoUrl,
    ...switches,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    scheduleStepMinutes: settings.scheduleStepMinutes as 15 | 30,
    debtTelegramDays: settings.debtTelegramDays,
    debtSmsDays: settings.debtSmsDays,
    debtTaskDays: settings.debtTaskDays,
    referralBonus: settings.referralBonus,
    publicPage: settings.publicPage,
    publicSlug: settings.publicSlug,
    publicIntro: settings.publicIntro,
    publicPhone: settings.publicPhone,
    publicAddress: settings.publicAddress,
    publicInstagram: settings.publicInstagram,
    publicTelegram: settings.publicTelegram,
    publicFormId: settings.publicFormId,
  };
}

/** EXP §8 "Markaz sozlamalari". Visible to anyone who may open settings. */
export async function getOrgSettings(actor: Actor, db: DbClient = prisma): Promise<OrgSettingsDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const settings = await loadSettings(db, organizationId);
  return toDto(org, settings);
}

export async function updateOrgSettings(
  actor: Actor,
  input: OrgSettingsInput,
  db: DbClient = prisma,
): Promise<OrgSettingsDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  // Pick the columns explicitly so a caller can never write anything else.
  const switches = Object.fromEntries(ORG_SWITCHES.map((k) => [k, input[k]])) as Record<
    (typeof ORG_SWITCHES)[number],
    boolean
  >;
  const data = {
    ...switches,
    workStart: input.workStart,
    workEnd: input.workEnd,
    scheduleStepMinutes: input.scheduleStepMinutes,
    // Debt reminder cadence (A-112): a field left out keeps its value, null switches the step off.
    debtTelegramDays: input.debtTelegramDays,
    debtSmsDays: input.debtSmsDays,
    debtTaskDays: input.debtTaskDays,
    // Referral programme (A-120): the bonus a student earns when a friend they invited joins.
    referralBonus: input.referralBonus,
    // Public page (A-121); a field left out keeps its value, "" clears it.
    publicPage: input.publicPage,
    publicSlug: input.publicSlug,
    publicIntro: input.publicIntro,
    publicPhone: input.publicPhone,
    publicAddress: input.publicAddress,
    publicInstagram: input.publicInstagram,
    publicTelegram: input.publicTelegram,
    publicFormId: input.publicFormId,
  };
  if (input.publicFormId) {
    const form = await db.leadForm.findFirst({
      where: { id: input.publicFormId, organizationId },
      select: { id: true },
    });
    if (!form) throw AppError.validation({ publicFormId: ["validation.formUnknown"] });
  }

  return db.$transaction(async (tx) => {
    const beforeOrg = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const beforeSettings = await loadSettings(tx, organizationId);
    const before = toDto(beforeOrg, beforeSettings);

    const org = await tx.organization.update({
      where: { id: organizationId },
      data: { name: input.name },
    });
    const settings = await tx.orgSettings
      .update({ where: { organizationId }, data })
      // Another centre already uses that page address.
      .catch((error: unknown) => rethrowAsAppError(error, "publicSlug"));
    const after = toDto(org, settings);

    await recordAudit(tx, actor, {
      action: "settings.org.update",
      entity: "Organization",
      entityId: organizationId,
      before,
      after,
      branchId: null,
    });
    return after;
  });
}
