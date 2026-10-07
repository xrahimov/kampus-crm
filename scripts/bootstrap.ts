/**
 * First start of a real deployment (docs/DEPLOY.md): creates the organisation,
 * one branch, the system roles and the first CEO account from environment
 * variables. Nothing invented is written. Re-runnable: it does nothing once an
 * organisation exists, so the variables can be removed from .env afterwards.
 *
 *   BOOTSTRAP_ORG_NAME="My Learning Center" BOOTSTRAP_BRANCH_NAME="Main" \
 *   BOOTSTRAP_CEO_PHONE="+998901234567" BOOTSTRAP_CEO_PASSWORD="..." \
 *   npm run db:bootstrap
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/lib/rbac/default-roles";
import { hashPassword } from "../src/server/auth/password";

const ROLE_NAMES: Record<(typeof SYSTEM_ROLES)[number], string> = {
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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set (see .env.production.example)`);
  return value;
}

async function main() {
  if ((await prisma.organization.count()) > 0) {
    console.log("Bootstrap skipped: an organisation already exists.");
    return;
  }
  const orgName = required("BOOTSTRAP_ORG_NAME");
  const branchName = required("BOOTSTRAP_BRANCH_NAME");
  const phone = required("BOOTSTRAP_CEO_PHONE");
  const password = required("BOOTSTRAP_CEO_PASSWORD");
  if (!/^\+\d{9,15}$/.test(phone)) {
    throw new Error("BOOTSTRAP_CEO_PHONE must be in international form, e.g. +998901234567");
  }
  if (password.length < 8) throw new Error("BOOTSTRAP_CEO_PASSWORD must be at least 8 characters");

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const branch = await tx.branch.create({ data: { organizationId: org.id, name: branchName } });
    for (const code of SYSTEM_ROLES) {
      await tx.role.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: ROLE_NAMES[code],
          isSystem: true,
          permissions: DEFAULT_ROLE_PERMISSIONS[code],
        },
      });
    }
    const ceoRole = await tx.role.findUniqueOrThrow({ where: { code: "CEO" } });
    const user = await tx.user.create({
      data: {
        organizationId: org.id,
        phone,
        fullName: process.env.BOOTSTRAP_CEO_NAME?.trim() || "CEO",
        passwordHash,
        roles: { create: { roleId: ceoRole.id } },
        branches: { create: { branchId: branch.id } },
      },
    });
    await tx.paymentMethod.create({
      data: { organizationId: org.id, name: process.env.BOOTSTRAP_CASH_NAME?.trim() || "Cash" },
    });
    console.log(
      `Created organisation "${org.name}", branch "${branch.name}" and CEO ${user.phone}.`,
    );
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
