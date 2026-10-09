import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "@/lib/rbac/default-roles";
import type { OrganizationCreateInput, OrganizationUpdateInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorizeSiteOwner, type Actor } from "@/server/rbac/authorize";

import { mustFind, prismaCode } from "./shared";

/*
 * Organisations (A-108): one Kampus server hosts several learning centres. The
 * site owner creates them here; everything else about a centre is run by its
 * own CEO from inside it.
 */

/** Display names of the system roles, shared by the seed, the bootstrap and new centres. */
export const SYSTEM_ROLE_NAMES: Record<(typeof SYSTEM_ROLES)[number], string> = {
  CEO: "CEO",
  ADMIN: "Admin",
  BRANCH_MANAGER: "Branch manager",
  CASHIER: "Cashier",
  TEACHER: "Teacher",
  SUPPORT_TEACHER: "Support teacher",
  MARKETER: "Marketer",
  WATCHER: "Watcher",
  PARENT: "Parent",
  OTHER: "Other",
};

export interface OrganizationDto {
  id: string;
  name: string;
  /** The centre's own address, e.g. "kingston.kampus.uz" (A-114); null = the server's domain. */
  domain: string | null;
  createdAt: string;
  branches: Array<{ id: string; name: string; isActive: boolean }>;
  ceo: { fullName: string; phone: string } | null;
  staffCount: number;
  studentsCount: number;
}

export interface ProvisionInput {
  name: string;
  branches: string[];
  ceo: { fullName: string; phone: string; password: string; isSiteOwner?: boolean };
  /** Name of the first payment method; "Naqd" (cash) unless told otherwise. */
  cashMethodName?: string;
}

/**
 * Creates a centre from nothing: the organisation, its settings row, its
 * branches, the shared system roles if missing, one cash payment method and
 * the CEO account attached to every branch. Used by the first-start bootstrap
 * and by the site owner's page; always inside the caller's transaction.
 */
export async function provisionOrganization(
  tx: DbClient,
  input: ProvisionInput,
): Promise<{ organizationId: string; branchIds: string[]; ceoUserId: string }> {
  const org = await tx.organization.create({ data: { name: input.name } });
  await tx.orgSettings.create({ data: { organizationId: org.id } });
  const branchIds: string[] = [];
  for (const name of input.branches) {
    const branch = await tx.branch.create({ data: { organizationId: org.id, name } });
    branchIds.push(branch.id);
  }
  for (const code of SYSTEM_ROLES) {
    await tx.role.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name: SYSTEM_ROLE_NAMES[code],
        isSystem: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[code],
      },
    });
  }
  // The first method is the cash drawer, counted at the day close (A-122).
  await tx.paymentMethod.create({
    data: { organizationId: org.id, name: input.cashMethodName?.trim() || "Naqd", isCash: true },
  });
  const ceoRole = await tx.role.findUniqueOrThrow({ where: { code: "CEO" } });
  const user = await tx.user.create({
    data: {
      organizationId: org.id,
      phone: input.ceo.phone,
      fullName: input.ceo.fullName,
      passwordHash: await hashPassword(input.ceo.password),
      isSiteOwner: input.ceo.isSiteOwner ?? false,
      roles: { create: { roleId: ceoRole.id } },
      branches: { create: branchIds.map((branchId) => ({ branchId })) },
    },
  });
  return { organizationId: org.id, branchIds, ceoUserId: user.id };
}

const include = {
  branches: { select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } },
  users: {
    where: { isArchived: false, roles: { some: { role: { code: "CEO" } } } },
    select: { fullName: true, phone: true },
    orderBy: { createdAt: "asc" },
    take: 1,
  },
  _count: { select: { users: { where: { isArchived: false } } } },
} satisfies Prisma.OrganizationInclude;

type Row = Prisma.OrganizationGetPayload<{ include: typeof include }>;

async function toDto(db: DbClient, row: Row): Promise<OrganizationDto> {
  const studentsCount = await db.student.count({
    where: { isArchived: false, branch: { organizationId: row.id } },
  });
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    createdAt: row.createdAt.toISOString(),
    branches: row.branches,
    ceo: row.users[0] ?? null,
    staffCount: row._count.users,
    studentsCount,
  };
}

export async function listOrganizations(
  actor: Actor,
  db: DbClient = prisma,
): Promise<OrganizationDto[]> {
  authorizeSiteOwner(actor);
  const rows = await db.organization.findMany({ include, orderBy: { createdAt: "asc" } });
  return Promise.all(rows.map((row) => toDto(db, row)));
}

export async function createOrganization(
  actor: Actor,
  input: OrganizationCreateInput,
  db: DbClient = prisma,
): Promise<OrganizationDto> {
  authorizeSiteOwner(actor);
  const branches = Array.from(new Set(input.branches.map((b) => b.trim()).filter(Boolean)));
  if (branches.length === 0) throw AppError.validation({ branches: ["validation.required"] });
  // One phone number is one account on the whole server (A-108).
  const taken = await db.user.findUnique({
    where: { phone: input.ceoPhone },
    select: { id: true },
  });
  if (taken) throw AppError.validation({ ceoPhone: ["validation.duplicate"] });
  try {
    const id = await db.$transaction(async (tx) => {
      const created = await provisionOrganization(tx, {
        name: input.name,
        branches,
        ceo: { fullName: input.ceoFullName, phone: input.ceoPhone, password: input.ceoPassword },
      });
      await recordAudit(tx, actor, {
        action: "organization.create",
        entity: "Organization",
        entityId: created.organizationId,
        after: { name: input.name, branches, ceo: { phone: input.ceoPhone } },
        branchId: null,
      });
      return created.organizationId;
    });
    const row = await db.organization.findUniqueOrThrow({ where: { id }, include });
    return toDto(db, row);
  } catch (error) {
    if (prismaCode(error) === "P2002") {
      throw AppError.validation({ ceoPhone: ["validation.duplicate"] });
    }
    throw error;
  }
}

export async function updateOrganization(
  actor: Actor,
  id: string,
  input: OrganizationUpdateInput,
  db: DbClient = prisma,
): Promise<OrganizationDto> {
  authorizeSiteOwner(actor);
  const { domain } = input;
  try {
    const row = await db.$transaction(async (tx) => {
      const before = await mustFind(tx.organization.findUnique({ where: { id }, include }));
      const after = await tx.organization.update({
        where: { id },
        data: { name: input.name, ...(domain === undefined ? {} : { domain }) },
        include,
      });
      await recordAudit(tx, actor, {
        action: "organization.update",
        entity: "Organization",
        entityId: id,
        before: { name: before.name, domain: before.domain },
        after: { name: after.name, domain: after.domain },
        branchId: null,
      });
      return after;
    });
    return toDto(db, row);
  } catch (error) {
    // Two centres cannot share one address.
    if (prismaCode(error) === "P2002") {
      throw AppError.validation({ domain: ["validation.duplicate"] });
    }
    throw error;
  }
}
