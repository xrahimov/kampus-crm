import type { Prisma } from "@/generated/prisma/client";
import {
  INTEGRATION_PROVIDERS,
  MASKED,
  integrationSchemas,
  type IntegrationInput,
  type IntegrationProvider,
} from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import {
  createAmoCrmClient,
  type AmoCrmClient,
  type AmoCrmTokens,
} from "@/server/integrations/amocrm/client";
import { createFiscalProvider, type FiscalProvider } from "@/server/integrations/fiscal/provider";
import { createSmsProvider, type SmsProvider } from "@/server/integrations/sms/provider";
import {
  createTelegramNotifier,
  type TelegramNotifier,
} from "@/server/integrations/telegram/notifier";
import {
  createTelephonyProvider,
  type TelephonyProvider,
} from "@/server/integrations/telephony/provider";
import { authorize, type Actor } from "@/server/rbac/authorize";

/* Settings → Integrations (EXP §8 AmoCRM, FaceID; A-83 for the rest). */

/** Fields that never leave the server in clear text. */
const SECRET_FIELDS: Record<IntegrationProvider, readonly string[]> = {
  SMS: ["password"],
  TELEGRAM: ["botToken", "webhookSecret"],
  AMOCRM: ["secretKey", "authorizationCode", "webhookSecret"],
  TELEPHONY: ["webhookSecret"],
  FACE_ID: ["webhookSecret"],
  VIDEO: ["turnCredential", "turnSecret"],
  PAYME: ["key"],
  CLICK: ["secretKey"],
  FISCAL: ["apiKey"],
};

/** Providers that work without any setup and are therefore on until switched off. */
const ON_BY_DEFAULT: readonly IntegrationProvider[] = ["VIDEO"];

type Config<P extends IntegrationProvider> = Omit<IntegrationInput<P>, "isEnabled">;

export interface IntegrationDto<P extends IntegrationProvider = IntegrationProvider> {
  provider: P;
  isEnabled: boolean;
  /** Secrets replaced by MASKED when set, "" when empty. */
  config: Record<string, unknown>;
  /** Extra read-only state, e.g. whether AmoCRM holds tokens. */
  state: Record<string, unknown>;
  updatedAt: string | null;
}

function defaults<P extends IntegrationProvider>(provider: P): IntegrationInput<P> {
  return integrationSchemas[provider].parse({
    isEnabled: false,
    email: "",
    password: "",
    botToken: "",
    webhookSecret: "",
    secretKey: "",
    integrationId: "",
    authorizationCode: "",
    subDomain: "",
  }) as IntegrationInput<P>;
}

async function loadRow<P extends IntegrationProvider>(
  db: DbClient,
  organizationId: string,
  provider: P,
) {
  const row = await db.integrationSetting.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  const base = defaults(provider) as Record<string, unknown>;
  const stored = (row?.config ?? {}) as Record<string, unknown>;
  const { isEnabled: _ignored, ...configDefaults } = base;
  const config = { ...configDefaults, ...stored } as Config<P> & Record<string, unknown>;
  const isEnabled = row?.isEnabled ?? ON_BY_DEFAULT.includes(provider);
  return { organizationId, row, isEnabled, config };
}

/**
 * The raw configuration for the adapters of one centre; never returned to
 * clients. Every caller names the centre: a signed-in actor's, a student link's
 * (through its branch) or the one a webhook's credentials matched (A-108).
 */
export async function loadIntegrationConfig<P extends IntegrationProvider>(
  db: DbClient,
  provider: P,
  organizationId: string,
): Promise<(Config<P> & { isEnabled: boolean }) | null> {
  const { row, isEnabled, config } = await loadRow(db, organizationId, provider);
  if (!row && !ON_BY_DEFAULT.includes(provider)) return null;
  return { ...config, isEnabled } as Config<P> & { isEnabled: boolean };
}

function toDto<P extends IntegrationProvider>(
  provider: P,
  isEnabled: boolean,
  config: Record<string, unknown>,
  updatedAt: Date | null,
): IntegrationDto<P> {
  const masked: Record<string, unknown> = {};
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === "tokens") {
      state.hasTokens = Boolean(value);
      continue;
    }
    masked[key] = SECRET_FIELDS[provider].includes(key) ? (value ? MASKED : "") : value;
  }
  return {
    provider,
    isEnabled,
    config: masked,
    state,
    updatedAt: updatedAt?.toISOString() ?? null,
  };
}

export async function getIntegration<P extends IntegrationProvider>(
  actor: Actor,
  provider: P,
  db: DbClient = prisma,
): Promise<IntegrationDto<P>> {
  authorize(actor, "settings.integrations");
  const { row, isEnabled, config } = await loadRow(db, actor.organizationId, provider);
  const dto = toDto(provider, isEnabled, config, row?.updatedAt ?? null);
  if (provider === "TELEGRAM") {
    // Tell the centre when the server's shared bot is the one serving it (A-135).
    const effective = await telegramConfigFor(db, actor.organizationId);
    dto.state.sharedBot =
      effective && effective.organizationId !== actor.organizationId
        ? { username: effective.config.botUsername || null }
        : null;
  }
  return dto;
}

export async function listIntegrations(
  actor: Actor,
  db: DbClient = prisma,
): Promise<IntegrationDto[]> {
  authorize(actor, "settings.integrations");
  return Promise.all(INTEGRATION_PROVIDERS.map((p) => getIntegration(actor, p, db)));
}

export async function updateIntegration<P extends IntegrationProvider>(
  actor: Actor,
  provider: P,
  input: IntegrationInput<P>,
  db: DbClient = prisma,
): Promise<IntegrationDto<P>> {
  authorize(actor, "settings.integrations");
  const { organizationId, config: previous } = await loadRow(db, actor.organizationId, provider);
  const { isEnabled, ...rest } = input as Record<string, unknown> & { isEnabled: boolean };
  const next: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(rest)) {
    // A masked secret means "keep what is stored".
    if (SECRET_FIELDS[provider].includes(key) && value === MASKED) continue;
    next[key] = value;
  }
  if (provider === "TELEGRAM" && actor.isSiteOwner !== true) {
    // Only the server's owner may offer their bot to every centre (A-135).
    next.sharedWithAllCentres = false;
  }
  if (provider === "AMOCRM") {
    // New credentials invalidate the tokens obtained with the old ones.
    const changed = (
      ["secretKey", "integrationId", "authorizationCode", "subDomain"] as const
    ).some((k) => previous[k] !== next[k]);
    if (changed) next.tokens = null;
  }
  return db.$transaction(async (tx) => {
    const row = await tx.integrationSetting.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      create: {
        organizationId,
        provider,
        isEnabled,
        config: next as unknown as Prisma.InputJsonValue,
      },
      update: { isEnabled, config: next as unknown as Prisma.InputJsonValue },
    });
    await recordAudit(tx, actor, {
      action: "integration.update",
      entity: "IntegrationSetting",
      entityId: row.id,
      // Only non-secret fields reach the audit log.
      after: toDto(provider, isEnabled, next, row.updatedAt).config,
      branchId: null,
    });
    return toDto(provider, isEnabled, next, row.updatedAt);
  });
}

/* ----- adapters ---------------------------------------------------------------------------- */

export async function getSmsProvider(db: DbClient, organizationId: string): Promise<SmsProvider> {
  return createSmsProvider(await loadIntegrationConfig(db, "SMS", organizationId));
}

type TelegramConfig = Config<"TELEGRAM"> & { isEnabled: boolean };

function hasOwnBot(config: TelegramConfig | null): boolean {
  return Boolean(
    config?.isEnabled && (config.botToken || config.botUsername || config.webhookSecret),
  );
}

/**
 * The Telegram bot that serves a centre (A-135): its own when it has set one
 * up, else the server's shared bot when the site owner ticked "shared with all
 * centres" on theirs. The centre's own preferences (the weekly report switch)
 * still apply when it has a row of its own. Null when neither exists.
 */
export async function telegramConfigFor(
  db: DbClient,
  organizationId: string,
): Promise<{ organizationId: string; config: TelegramConfig } | null> {
  const own = await loadIntegrationConfig(db, "TELEGRAM", organizationId);
  if (own && hasOwnBot(own)) return { organizationId, config: own };
  const sharedOrganizationId = await findOrganizationByConfig(
    db,
    "TELEGRAM",
    (c) => c.sharedWithAllCentres === true,
  );
  if (!sharedOrganizationId || sharedOrganizationId === organizationId) return null;
  const shared = await loadIntegrationConfig(db, "TELEGRAM", sharedOrganizationId);
  if (!shared?.isEnabled) return null;
  return {
    organizationId: sharedOrganizationId,
    config: own ? { ...shared, weeklyReport: own.weeklyReport } : shared,
  };
}

/** Whether updates arriving through this centre's bot may concern any centre (A-135). */
export async function isSharedTelegramBot(db: DbClient, organizationId: string): Promise<boolean> {
  const config = await loadIntegrationConfig(db, "TELEGRAM", organizationId);
  return Boolean(config?.isEnabled && config.sharedWithAllCentres);
}

export async function getTelegramNotifier(
  db: DbClient,
  organizationId: string,
): Promise<TelegramNotifier> {
  return createTelegramNotifier((await telegramConfigFor(db, organizationId))?.config ?? null);
}

export type FiscalConfig = Config<"FISCAL"> & { isEnabled: boolean };

/** The centre's fiscal settings when the integration is on; null otherwise (A-147). */
export async function fiscalConfigFor(
  db: DbClient,
  organizationId: string,
): Promise<FiscalConfig | null> {
  const config = await loadIntegrationConfig(db, "FISCAL", organizationId);
  return config?.isEnabled ? config : null;
}

export function getFiscalProvider(config: FiscalConfig | null): FiscalProvider {
  return createFiscalProvider(config);
}

export function getTelephonyProvider(): TelephonyProvider {
  return createTelephonyProvider();
}

export async function getAmoCrmClient(db: DbClient, organizationId: string): Promise<AmoCrmClient> {
  const config = await loadIntegrationConfig(db, "AMOCRM", organizationId);
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3000"}/api/v1/webhooks/amocrm`;
  return createAmoCrmClient(
    config
      ? { ...config, tokens: (config as { tokens?: AmoCrmTokens | null }).tokens ?? null }
      : null,
    redirectUri,
  );
}

/** Persists rotated AmoCRM tokens after a call. */
export async function saveAmoCrmTokens(
  db: DbClient,
  organizationId: string,
  tokens: AmoCrmTokens | null,
): Promise<void> {
  const row = await db.integrationSetting.findUnique({
    where: { organizationId_provider: { organizationId, provider: "AMOCRM" } },
  });
  if (!row) return;
  const config = { ...((row.config ?? {}) as Record<string, unknown>), tokens };
  await db.integrationSetting.update({
    where: { id: row.id },
    data: { config: config as unknown as Prisma.InputJsonValue },
  });
}

/** "Test connection" on the AmoCRM page. */
export async function testAmoCrm(
  actor: Actor,
  db: DbClient = prisma,
): Promise<{ ok: boolean; account?: string; error?: string; adapter: string }> {
  authorize(actor, "settings.integrations");
  const client = await getAmoCrmClient(db, actor.organizationId);
  const result = await client.testConnection();
  if (client.tokens()) await saveAmoCrmTokens(db, actor.organizationId, client.tokens());
  return { ...result, adapter: client.name };
}

/**
 * Webhooks carry the shared secret in `x-kampus-secret` (or `?secret=`). The
 * secret also says which centre the call is for: every centre sets its own in
 * Settings → Integrations, and the one whose enabled secret matches is the
 * caller's (A-108). A provider that is disabled or has no secret accepts nothing.
 * Resolves to the organisation id.
 */
export async function assertWebhookSecret(
  db: DbClient,
  provider: "TELEGRAM" | "TELEPHONY" | "FACE_ID" | "AMOCRM",
  presented: string | null,
): Promise<string> {
  const organizationId = presented
    ? await findOrganizationByConfig(db, provider, (c) => c.webhookSecret === presented)
    : null;
  if (!organizationId) throw AppError.forbidden("errors.webhookRejected");
  return organizationId;
}

/**
 * The centre whose enabled configuration of `provider` satisfies `match`: how
 * a webhook with no session finds its tenant by the credential it presents.
 */
export async function findOrganizationByConfig(
  db: DbClient,
  provider: IntegrationProvider,
  match: (config: Record<string, unknown>) => boolean,
): Promise<string | null> {
  const rows = await db.integrationSetting.findMany({
    where: { provider, isEnabled: true },
    orderBy: { updatedAt: "asc" },
    select: { organizationId: true, config: true },
  });
  for (const row of rows) {
    const config = (row.config ?? {}) as Record<string, unknown>;
    if (match(config)) return row.organizationId;
  }
  return null;
}
