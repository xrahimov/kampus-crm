import { prisma, type DbClient } from "@/server/db/prisma";

/*
 * A centre's own address (A-114). The server answers on its main domain
 * (APP_URL / DOMAIN) and on every domain a centre has claimed in Settings →
 * Organisations: the login page then carries that centre's name and logo, and
 * the links Kampus sends its students use that address. Certificates for the
 * claimed domains are issued by Caddy on first visit, after it has asked
 * /api/v1/public/tls-ask whether the name is one of ours.
 */

export interface BrandDto {
  organizationId: string;
  name: string;
  logoUrl: string | null;
}

/** The server's own address, as configured for the deployment. */
export function serverOrigin(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** Lower-case host name without the port; null when the value is not a host at all. */
export function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return host && /^[a-z0-9.-]+$/.test(host) ? host : null;
}

const serverHost = (): string | null => {
  try {
    return normalizeHost(new URL(serverOrigin()).host);
  } catch {
    return null;
  }
};

/** The centre that claimed this host, or null for the main domain and unknown names. */
export async function organizationForHost(
  value: string | null | undefined,
  db: DbClient = prisma,
): Promise<BrandDto | null> {
  const host = normalizeHost(value);
  if (!host) return null;
  const org = await db.organization.findUnique({
    where: { domain: host },
    select: { id: true, name: true, logoUrl: true },
  });
  return org ? { organizationId: org.id, name: org.name, logoUrl: org.logoUrl } : null;
}

/** Whether Caddy may issue a certificate for this name: the main domain or a claimed one. */
export async function isServedHost(
  value: string | null | undefined,
  db: DbClient = prisma,
): Promise<boolean> {
  const host = normalizeHost(value);
  // No name, or a bare IP address: nothing a certificate could be issued for.
  if (!host || /^\d+(\.\d+){3}$/.test(host)) return false;
  if (host === serverHost()) return true;
  return (await organizationForHost(host, db)) !== null;
}

/** The address a centre's students should be sent to: its own domain, else the server's. */
export async function appOriginFor(
  organizationId: string | null | undefined,
  db: DbClient = prisma,
): Promise<string> {
  if (!organizationId) return serverOrigin();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { domain: true },
  });
  return org?.domain ? `https://${org.domain}` : serverOrigin();
}

/** The same, starting from a group (branch → organisation). */
export async function appOriginForGroup(groupId: string, db: DbClient = prisma): Promise<string> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { branch: { select: { organizationId: true } } },
  });
  return appOriginFor(group?.branch.organizationId, db);
}
