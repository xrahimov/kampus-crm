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

type Salary =
  | { salaryMethod: "PERCENT"; percentShare: number }
  | { salaryMethod: "MONTHLY"; fixedSalary: number }
  | { salaryMethod: "PER_LESSON"; perLessonFee: number }
  | { salaryMethod: "PER_STUDENT"; perStudentFee: number };

const DEMO_USERS: Array<{
  phone: string;
  fullName: string;
  roles: Array<(typeof SYSTEM_ROLES)[number]>;
  branches: "all" | string[];
  gender?: "MALE" | "FEMALE";
  salary?: Salary;
}> = [
  {
    phone: process.env.SEED_ADMIN_PHONE ?? "+998900000001",
    fullName: "Demo CEO",
    roles: ["CEO"],
    branches: "all",
  },
  { phone: "+998900000002", fullName: "Demo Admin", roles: ["ADMIN"], branches: ["Central"] },
  { phone: "+998900000003", fullName: "Demo Cashier", roles: ["CASHIER"], branches: ["Central"] },
  {
    phone: "+998900000004",
    fullName: "Demo Teacher",
    roles: ["TEACHER"],
    branches: ["Central"],
    salary: { salaryMethod: "PERCENT", percentShare: 40 },
  },
  {
    phone: "+998900000005",
    fullName: "Demo Branch Manager",
    roles: ["BRANCH_MANAGER"],
    branches: ["Riverside"],
    salary: { salaryMethod: "MONTHLY", fixedSalary: 6_000_000 },
  },
  // Phase 4: more teachers so the list, tabs and salary methods have something to show.
  {
    phone: "+998900000006",
    fullName: "Demo Teacher Two",
    roles: ["TEACHER"],
    branches: ["Riverside"],
    gender: "FEMALE",
    salary: { salaryMethod: "MONTHLY", fixedSalary: 4_500_000 },
  },
  {
    phone: "+998900000007",
    fullName: "Demo Teacher Three",
    roles: ["TEACHER"],
    branches: ["Central", "Riverside"],
    salary: { salaryMethod: "PER_LESSON", perLessonFee: 120_000 },
  },
  {
    phone: "+998900000008",
    fullName: "Demo Support Teacher",
    roles: ["SUPPORT_TEACHER"],
    branches: ["Central"],
    gender: "FEMALE",
    salary: { salaryMethod: "PER_STUDENT", perStudentFee: 50_000 },
  },
];

/** Phase 3 catalogue: invented values, no connection to any real centre. */
async function seedSettings(organizationId: string, branches: Map<string, string>) {
  await prisma.orgSettings.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId, refundsEnabled: true, printReceiptAfterPayment: true },
  });

  const paymentMethods = ["Cash", "Card", "Bank transfer"];
  for (const [i, name] of paymentMethods.entries()) {
    await prisma.paymentMethod.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: { sortOrder: i },
      create: { organizationId, name, sortOrder: i },
    });
  }

  const gradingSystems: Array<{
    name: string;
    rounding: "STANDARD" | "IELTS";
    levels: Array<[string, number, number]>;
  }> = [
    {
      name: "CEFR",
      rounding: "STANDARD",
      levels: [
        ["A1", 0, 20],
        ["A2", 21, 40],
        ["B1", 41, 60],
        ["B2", 61, 80],
        ["C1", 81, 100],
      ],
    },
    {
      name: "IELTS",
      rounding: "IELTS",
      levels: [
        ["4.0", 4, 4.5],
        ["5.0", 5, 5.5],
        ["6.0", 6, 6.5],
        ["7.0", 7, 7.5],
        ["8.0", 8, 8.5],
        ["9.0", 9, 9],
      ],
    },
    {
      name: "Standard 1–5",
      rounding: "STANDARD",
      levels: [
        ["1", 0, 20],
        ["2", 21, 40],
        ["3", 41, 60],
        ["4", 61, 80],
        ["5", 81, 100],
      ],
    },
    {
      name: "Pure 100",
      rounding: "STANDARD",
      levels: Array.from({ length: 10 }, (_, i): [string, number, number] => [
        `${i * 10 + 1}–${(i + 1) * 10}`,
        i * 10 + (i === 0 ? 0 : 1),
        (i + 1) * 10,
      ]),
    },
  ];
  const gradingIds = new Map<string, string>();
  for (const system of gradingSystems) {
    const existing = await prisma.gradingSystem.findUnique({
      where: { organizationId_name: { organizationId, name: system.name } },
    });
    if (existing) {
      gradingIds.set(system.name, existing.id);
      continue;
    }
    const created = await prisma.gradingSystem.create({
      data: {
        organizationId,
        name: system.name,
        rounding: system.rounding,
        levels: {
          create: system.levels.map(([name, minScore, maxScore], sortOrder) => ({
            name,
            minScore,
            maxScore,
            sortOrder,
          })),
        },
      },
    });
    gradingIds.set(system.name, created.id);
  }

  const courses: Array<[string, string, number, number, string | null, string]> = [
    ["General English", "Central", 450_000, 6, "CEFR", "#0F766E"],
    ["IELTS Preparation", "Central", 650_000, 4, "IELTS", "#B45309"],
    ["Mathematics", "Central", 400_000, 9, "Standard 1–5", "#1D4ED8"],
    ["General English", "Riverside", 420_000, 6, "CEFR", "#0F766E"],
    ["Russian for beginners", "Riverside", 380_000, 6, null, "#7C3AED"],
  ];
  for (const [name, branchName, price, durationMonths, grading, color] of courses) {
    const branchId = branches.get(branchName)!;
    const existing = await prisma.course.findFirst({ where: { branchId, name } });
    if (existing) continue;
    await prisma.course.create({
      data: {
        branchId,
        name,
        price,
        durationMonths,
        color,
        gradingSystemId: grading ? gradingIds.get(grading) : null,
        description: "Demo course",
      },
    });
  }

  const rooms: Array<[string, string, number]> = [
    ["Room 101", "Central", 12],
    ["Room 102", "Central", 16],
    ["Lab", "Central", 8],
    ["Room A", "Riverside", 10],
    ["Room B", "Riverside", 14],
  ];
  for (const [name, branchName, capacity] of rooms) {
    const branchId = branches.get(branchName)!;
    await prisma.room.upsert({
      where: { branchId_name: { branchId, name } },
      update: { capacity },
      create: { branchId, name, capacity },
    });
  }

  for (const branchId of branches.values()) {
    await prisma.dayOff.upsert({
      where: { branchId_date: { branchId, date: new Date("2026-01-01T00:00:00.000Z") } },
      update: {},
      create: { branchId, date: new Date("2026-01-01T00:00:00.000Z"), reason: "New Year" },
    });
  }

  for (const name of ["School No. 1 (demo)", "School No. 2 (demo)", "Lyceum (demo)"]) {
    await prisma.school.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
  }
}

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
    const profile = {
      fullName: demo.fullName,
      gender: demo.gender ?? "MALE",
      ...(demo.salary ?? {}),
    };
    const user = await prisma.user.upsert({
      where: { phone: demo.phone },
      update: { ...profile, passwordHash, isArchived: false },
      create: {
        phone: demo.phone,
        ...profile,
        passwordHash,
        birthDate: new Date("1990-05-15"),
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

  await seedSettings(org.id, branches);

  console.log(`Seeded ${DEMO_USERS.length} demo users across ${branchNames.length} branches.`);
  console.log(`Sign in with ${DEMO_USERS[0]!.phone} and the SEED_ADMIN_PASSWORD from .env.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
