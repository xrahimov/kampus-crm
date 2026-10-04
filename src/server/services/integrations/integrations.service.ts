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
import { getOrganizationId } from "@/server/services/settings/shared";

/* Settings → Integrations (EXP §8 AmoCRM, FaceID; A-83 for the rest). */

/** Fields that never leave the server in clear text. */
const SECRET_FIELDS: Record<IntegrationProvider, readonly string[]> = {
  SMS: ["password"],
  TELEGRAM: ["botToken", "webhookSecret"],
  AMOCRM: ["secretKey", "authorizationCode"],
  TELEPHONY: ["webhookSecret"],
  FACE_ID: ["webhookSecret"],
};

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

async function loadRow<P extends IntegrationProvider>(db: DbClient, provider: P) {
  const organizationId = await getOrganizationId(db);
  const row = await db.integrationSetting.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  const base = defaults(provider) as Record<string, unknown>;
  const stored = (row?.config ?? {}) as Record<string, unknown>;
  const { isEnabled: _ignored, ...configDefaults } = base;
  const config = { ...configDefaults, ...stored } as Config<P> & Record<string, unknown>;
  return { organizationId, row, isEnabled: row?.isEnabled ?? false, config };
}

/** The raw configuration for the adapters; never returned to clients. */
export async function loadIntegrationConfig<P extends IntegrationProvider>(
  db: DbClient,
  provider: P,
): Promise<(Config<P> & { isEnabled: boolean }) | null> {
  const { row, isEnabled, config } = await loadRow(db, provider);
  if (!row) return null;
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
  const { row, isEnabled, config } = await loadRow(db, provider);
  return toDto(provider, isEnabled, config, row?.updatedAt ?? null);
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
  const { organizationId, config: previous } = await loadRow(db, provider);
  const { isEnabled, ...rest } = input as Record<string, unknown> & { isEnabled: boolean };
  const next: Record<string, unknown> = { ...previous };
  for (const [key, value] of Object.entries(rest)) {
    // A masked secret means "keep what is stored".
    if (SECRET_FIELDS[provider].includes(key) && value === MASKED) continue;
    next[key] = value;
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

export async function getSmsProvider(db: DbClient = prisma): Promise<SmsProvider> {
  return createSmsProvider(await loadIntegrationConfig(db, "SMS"));
}

export async function getTelegramNotifier(db: DbClient = prisma): Promise<TelegramNotifier> {
  return createTelegramNotifier(await loadIntegrationConfig(db, "TELEGRAM"));
}

export function getTelephonyProvider(): TelephonyProvider {
  return createTelephonyProvider();
}

export async function getAmoCrmClient(db: DbClient = prisma): Promise<AmoCrmClient> {
  const config = await loadIntegrationConfig(db, "AMOCRM");
  const redirectUri = `${process.env.APP_URL ?? "http://localhost:3000"}/api/v1/webhooks/amocrm`;
  return createAmoCrmClient(
    config
      ? { ...config, tokens: (config as { tokens?: AmoCrmTokens | null }).tokens ?? null }
      : null,
    redirectUri,
  );
}

/** Persists rotated AmoCRM tokens after a call. */
export async function saveAmoCrmTokens(db: DbClient, tokens: AmoCrmTokens | null): Promise<void> {
  const organizationId = await getOrganizationId(db);
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
  const client = await getAmoCrmClient(db);
  const result = await client.testConnection();
  if (client.tokens()) await saveAmoCrmTokens(db, client.tokens());
  return { ...result, adapter: client.name };
}

/**
 * Webhooks carry the shared secret in `x-kampus-secret` (or `?secret=`). A provider
 * that is disabled or has no secret accepts nothing.
 */
export async function assertWebhookSecret(
  db: DbClient,
  provider: "TELEGRAM" | "TELEPHONY" | "FACE_ID",
  presented: string | null,
): Promise<void> {
  const config = await loadIntegrationConfig(db, provider);
  const expected = (config as { webhookSecret?: string } | null)?.webhookSecret ?? "";
  if (!config?.isEnabled || !expected || !presented || presented !== expected) {
    throw AppError.forbidden("errors.webhookRejected");
  }
}
