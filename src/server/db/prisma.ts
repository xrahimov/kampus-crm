import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * One PrismaClient per process, created on first use.
 *
 * Lazy creation matters for two reasons: `next build` imports route modules
 * while collecting page data and must not need a database, and Next.js dev
 * reloads modules, so the instance is cached on `globalThis` to avoid
 * exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/** Behaves exactly like a PrismaClient; the real client is created on first property access. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
});

/** The client type inside `prisma.$transaction(async (tx) => ...)`. */
export type DbClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
