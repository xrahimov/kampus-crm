/**
 * Demo seed. Every value here is invented; nothing comes from the reference
 * system. Re-runnable: it upserts by stable keys.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/lib/rbac/default-roles";
import { hashPassword } from "../src/server/auth/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

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

const DEMO_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Kampus!2026";

const DEMO_USERS: Array<{
  phone: string;
  fullName: string;
  roles: Array<(typeof SYSTEM_ROLES)[number]>;
  branches: "all" | string[];
}> = [
  {
    phone: process.env.SEED_ADMIN_PHONE ?? "+998900000001",
    fullName: "Demo CEO",
    roles: ["CEO"],
    branches: "all",
  },
  { phone: "+998900000002", fullName: "Demo Admin", roles: ["ADMIN"], branches: ["Central"] },
  { phone: "+998900000003", fullName: "Demo Cashier", roles: ["CASHIER"], branches: ["Central"] },
  { phone: "+998900000004", fullName: "Demo Teacher", roles: ["TEACHER"], branches: ["Central"] },
  {
    phone: "+998900000005",
    fullName: "Demo Branch Manager",
    roles: ["BRANCH_MANAGER"],
    branches: ["Riverside"],
  },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org_demo" },
    update: { name: "Kampus Demo Learning Center" },
    create: { id: "org_demo", name: "Kampus Demo Learning Center" },
  });

  const branchNames = ["Central", "Riverside"];
  const branches = new Map<string, string>();
  for (const name of branchNames) {
    const existing = await prisma.branch.findFirst({ where: { organizationId: org.id, name } });
    const branch =
      existing ?? (await prisma.branch.create({ data: { organizationId: org.id, name } }));
    branches.set(name, branch.id);
  }

  for (const code of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { code },
      update: {
        name: ROLE_NAMES[code],
        isSystem: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[code],
      },
      create: {
        code,
        name: ROLE_NAMES[code],
        isSystem: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[code],
      },
    });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { phone: demo.phone },
      update: { fullName: demo.fullName, passwordHash, isArchived: false },
      create: {
        phone: demo.phone,
        fullName: demo.fullName,
        passwordHash,
        hireDate: new Date("2026-01-10"),
      },
    });
    const roles = await prisma.role.findMany({ where: { code: { in: demo.roles } } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });

    const branchIds =
      demo.branches === "all" ? [...branches.values()] : demo.branches.map((n) => branches.get(n)!);
    await prisma.userBranch.deleteMany({ where: { userId: user.id } });
    await prisma.userBranch.createMany({
      data: branchIds.map((branchId) => ({ userId: user.id, branchId })),
    });
  }

  console.log(`Seeded ${DEMO_USERS.length} demo users across ${branchNames.length} branches.`);
  console.log(`Sign in with ${DEMO_USERS[0]!.phone} and the SEED_ADMIN_PASSWORD from .env.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
