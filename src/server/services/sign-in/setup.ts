import type { DbClient } from "@/server/db/prisma";
import {
  findOrganizationByConfig,
  loadIntegrationConfig,
  telegramConfigFor,
} from "@/server/services/integrations/integrations.service";
import { organizationForHost } from "@/server/services/settings/domains.service";

/*
 * Which bot sends sign-in codes on an address (A-196). The same rule as the
 * older "Log in with Telegram" (A-150), without its login keys: on a centre's
 * own domain, the bot that centre uses, for its people only; on the server's
 * address, the site owner's shared bot for everyone; when none is shared, the
 * only centre that has a bot, or the site owner's centre among several.
 */

export interface BotSetup {
  /** The centre whose bot holds the chats and sends the codes. */
  botOrganizationId: string;
  botUsername: string | null;
  /** Only this centre's people may sign in here; null on the server's address with the shared bot. */
  scopeOrganizationId: string | null;
  brand: { name: string; logoUrl: string | null } | null;
}

interface BotConfig {
  isEnabled: boolean;
  botToken?: string;
  webhookSecret?: string;
}

/** Test servers have no bot token: the stand-in for Telegram delivers nothing and codes are predictable. */
export function fakeTelegram(): boolean {
  return process.env.TELEGRAM_LOGIN_FAKE === "1";
}

/** The bot can deliver a code: it is on and has a token (or the test stand-in is in force). */
function canSendCodes(config: BotConfig | null | undefined): boolean {
  if (!config?.isEnabled) return false;
  return Boolean(config.botToken) || (fakeTelegram() && Boolean(config.webhookSecret));
}

export async function resolveBotSetup(db: DbClient, host: string | null): Promise<BotSetup | null> {
  const brand = await organizationForHost(host, db);
  if (brand) {
    const effective = await telegramConfigFor(db, brand.organizationId);
    if (!effective || !canSendCodes(effective.config)) return null;
    return {
      botOrganizationId: effective.organizationId,
      botUsername: effective.config.botUsername || null,
      scopeOrganizationId: brand.organizationId,
      brand: { name: brand.name, logoUrl: brand.logoUrl },
    };
  }
  const sharedId = await findOrganizationByConfig(
    db,
    "TELEGRAM",
    (c) => c.sharedWithAllCentres === true,
  );
  let organizationId = sharedId;
  if (!organizationId) {
    const rows = await db.integrationSetting.findMany({
      where: { provider: "TELEGRAM", isEnabled: true },
      select: { organizationId: true, config: true },
    });
    const able = rows.filter((r) =>
      canSendCodes({ isEnabled: true, ...((r.config ?? {}) as Record<string, string>) }),
    );
    if (able.length === 0) return null;
    if (able.length === 1) organizationId = able[0]!.organizationId;
    else {
      // Several centres have a bot and none is shared: the server's own address
      // belongs to the site owner's centre, so its bot answers there.
      const owners = await db.user.findMany({
        where: {
          isSiteOwner: true,
          isArchived: false,
          organizationId: { in: able.map((r) => r.organizationId) },
        },
        select: { organizationId: true },
        distinct: ["organizationId"],
      });
      if (owners.length !== 1) return null;
      organizationId = owners[0]!.organizationId;
    }
  }
  const config = await loadIntegrationConfig(db, "TELEGRAM", organizationId);
  if (!canSendCodes(config)) return null;
  let brandOfOnly: BotSetup["brand"] = null;
  if (!sharedId) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    });
    brandOfOnly = org ? { name: org.name, logoUrl: org.logoUrl } : null;
  }
  return {
    botOrganizationId: organizationId,
    botUsername: config?.botUsername || null,
    scopeOrganizationId: sharedId ? null : organizationId,
    brand: brandOfOnly,
  };
}

/**
 * Whether this centre's people can really get a code in Telegram: a bot with a
 * token serves it. Only then is "the first sign-in is with Telegram" enforced,
 * so a server without a bot (a fresh one, a test one) still opens with a password.
 */
export async function telegramCodesLive(db: DbClient, organizationId: string): Promise<boolean> {
  const effective = await telegramConfigFor(db, organizationId);
  return Boolean(effective?.config.isEnabled && effective.config.botToken);
}

/** The link that opens the bot on its "share my number" step. */
export function botLoginUrl(botUsername: string | null): string | null {
  return botUsername ? `https://t.me/${botUsername}?start=login` : null;
}
