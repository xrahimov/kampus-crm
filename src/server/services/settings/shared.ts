import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";

/**
 * The organisation a branch belongs to, for code paths that have no actor
 * (webhooks, jobs, the student portal) but do have a branch (A-108).
 */
export async function organizationOfBranch(db: DbClient, branchId: string): Promise<string> {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { organizationId: true },
  });
  if (!branch) throw AppError.notFound("errors.branchNotFound");
  return branch.organizationId;
}

export async function mustFind<T>(
  promise: Promise<T | null>,
  message = "errors.notFound",
): Promise<T> {
  const record = await promise;
  if (!record) throw AppError.notFound(message);
  return record;
}

/** The Prisma error code (`P2002`, `P2003`, …) of a thrown request error, if any. */
export function prismaCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/**
 * Maps the two Prisma errors a CRUD service expects to typed errors:
 * P2002 (unique violation) → VALIDATION on `uniqueField`, P2003 (foreign key
 * in use) → CONFLICT. Anything else is rethrown.
 */
export function rethrowAsAppError(error: unknown, uniqueField: string): never {
  const code = prismaCode(error);
  if (code === "P2002") throw AppError.validation({ [uniqueField]: ["validation.duplicate"] });
  if (code === "P2003") throw AppError.conflict("errors.inUse");
  throw error;
}

/** Prisma Decimal → number for JSON. Amounts are UZS with two decimals, well inside 2^53. */
export function decimalToNumber(value: { toString(): string }): number {
  return Number(value.toString());
}

/** A `@db.Date` column → "YYYY-MM-DD" without time-zone drift. */
export function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → the UTC midnight Date Prisma stores in a `@db.Date` column. */
export function isoToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** The organisation's display name and logo, for printed pages anyone signed in may open. */
export async function getOrganizationBranding(
  db: DbClient,
  organizationId: string,
): Promise<{ name: string; logoUrl: string | null }> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, logoUrl: true },
  });
  if (!org) throw new AppError("INTERNAL", "errors.internal");
  return org;
}
