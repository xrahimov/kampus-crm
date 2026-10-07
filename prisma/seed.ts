/**
 * Demo seed. Every value here is invented; nothing comes from the reference
 * system. Re-runnable: it upserts by stable keys.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { type Prisma, PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/lib/rbac/default-roles";
import { hashPassword } from "../src/server/auth/password";
import { addMonths, planLessons } from "../src/server/services/groups/schedule";

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

/** Phase 5: demo groups with schedules, teachers, students, lessons and some attendance. Invented data. */
async function seedGroups(branches: Map<string, string>) {
  const userByPhone = async (phone: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { phone }, select: { id: true } })).id;
  const teacherOne = await userByPhone("+998900000004");
  const teacherTwo = await userByPhone("+998900000006");
  const teacherThree = await userByPhone("+998900000007");
  const support = await userByPhone("+998900000008");

  const GROUPS: Array<{
    name: string;
    branch: string;
    course: string;
    pattern: "EVEN" | "ODD" | "EVERY_DAY";
    time: [string, string];
    room: string | null;
    teachers: Array<[string, "MAIN" | "ASSISTANT", "PERCENT" | "PER_LESSON", number]>;
    support?: string[];
    startDate: string;
    students: string[];
  }> = [
    {
      name: "GE-Morning A1",
      branch: "Central",
      course: "General English",
      pattern: "EVEN",
      time: ["09:00", "10:30"],
      room: "Room 101",
      teachers: [[teacherOne, "MAIN", "PERCENT", 40]],
      support: [support],
      startDate: "2026-09-01",
      students: ["Demo Student One", "Demo Student Two", "Demo Student Three", "Demo Student Four"],
    },
    {
      name: "IELTS Evening",
      branch: "Central",
      course: "IELTS Preparation",
      pattern: "ODD",
      time: ["18:00", "19:30"],
      room: "Room 102",
      teachers: [
        [teacherThree, "MAIN", "PER_LESSON", 120_000],
        [teacherOne, "ASSISTANT", "PERCENT", 10],
      ],
      startDate: "2026-09-15",
      students: ["Demo Student Five", "Demo Student Six"],
    },
    {
      name: "GE-Riverside B1",
      branch: "Riverside",
      course: "General English",
      pattern: "EVERY_DAY",
      time: ["14:00", "15:00"],
      room: null,
      teachers: [[teacherTwo, "MAIN", "PERCENT", 45]],
      startDate: "2026-10-01",
      students: ["Demo Student Seven"],
    },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const weekdays = { EVEN: [2, 4, 6], ODD: [1, 3, 5], EVERY_DAY: [1, 2, 3, 4, 5, 6] };
  let created = 0;
  for (const g of GROUPS) {
    const branchId = branches.get(g.branch)!;
    if (await prisma.group.findFirst({ where: { branchId, name: g.name } })) continue;
    const course = await prisma.course.findFirstOrThrow({ where: { branchId, name: g.course } });
    const room = g.room
      ? await prisma.room.findUnique({ where: { branchId_name: { branchId, name: g.room } } })
      : null;
    const endDate = addMonths(g.startDate, course.durationMonths);
    const slots = weekdays[g.pattern].map((weekday) => ({
      weekday,
      startTime: g.time[0],
      endTime: g.time[1],
    }));
    const group = await prisma.group.create({
      data: {
        branchId,
        courseId: course.id,
        name: g.name,
        weekdayPattern: g.pattern,
        startDate: new Date(`${g.startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
        slots: { create: slots.map((s) => ({ ...s, roomId: room?.id ?? null })) },
        teachers: {
          create: g.teachers.map(([userId, role, shareType, shareValue]) => ({
            userId,
            role,
            shareType,
            shareValue,
            since: new Date(`${g.startDate}T00:00:00.000Z`),
          })),
        },
        supportTeachers: { create: (g.support ?? []).map((userId) => ({ userId })) },
        lessons: {
          create: planLessons(g.startDate, endDate, slots).map((l) => ({
            date: new Date(`${l.date}T00:00:00.000Z`),
            startTime: l.startTime,
            endTime: l.endTime,
          })),
        },
      },
      include: { lessons: { orderBy: { date: "asc" } } },
    });
    for (const [i, fullName] of g.students.entries()) {
      const student =
        (await prisma.student.findFirst({ where: { branchId, fullName } })) ??
        (await prisma.student.create({
          data: {
            branchId,
            fullName,
            phone: `+99891${String(1_000_000 + created * 10 + i).padStart(7, "0")}`,
            gender: i % 2 ? "FEMALE" : "MALE",
          },
        }));
      const membership = await prisma.groupMembership.create({
        data: {
          groupId: group.id,
          studentId: student.id,
          joinedAt: group.startDate,
          activatedAt: group.startDate,
        },
      });
      // Past lessons get a mark so the attendance grid has something to show.
      const past = group.lessons.filter((l) => l.date.toISOString().slice(0, 10) < today);
      await prisma.attendance.createMany({
        data: past.map((l, n) => ({
          lessonId: l.id,
          membershipId: membership.id,
          status: (n + i) % 5 === 0 ? "ABSENT" : "PRESENT",
          markedById: g.teachers[0]![0],
        })),
      });
    }
    created += 1;
  }
  console.log(`Seeded ${created} demo groups.`);
}

/** Phase 6: lead sources and a few demo payments so balances and the payments log have data. */
async function seedPayments(organizationId: string) {
  for (const name of ["Instagram", "Telegram", "Friend", "Walk-in", "Website"]) {
    await prisma.leadSource.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
  }
  if ((await prisma.payment.count()) > 0) return;
  const cash = await prisma.paymentMethod.findFirstOrThrow({
    where: { organizationId, name: "Cash" },
  });
  const cashier = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000003" } });
  const memberships = await prisma.groupMembership.findMany({
    include: { group: { select: { branchId: true, startDate: true } } },
    orderBy: { id: "asc" },
    take: 4,
  });
  for (const [i, m] of memberships.entries()) {
    const month = m.group.startDate;
    await prisma.payment.create({
      data: {
        studentId: m.studentId,
        membershipId: m.id,
        branchId: m.group.branchId,
        paymentMethodId: cash.id,
        amount: [500_000, 350_000, 1_000_000, 200_000][i]!,
        bonus: i === 2 ? 50_000 : 0,
        effectiveMonth: month,
        paidAt: month,
        comment: i === 1 ? "Partial payment" : null,
        receivedById: cashier.id,
      },
    });
  }
  // One payment received this month, so the payments report's staff tab has a row (Phase 12).
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (memberships[0]) {
    await prisma.payment.create({
      data: {
        studentId: memberships[0].studentId,
        membershipId: memberships[0].id,
        branchId: memberships[0].group.branchId,
        paymentMethodId: cash.id,
        amount: 450_000,
        bonus: 0,
        effectiveMonth: thisMonth,
        paidAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
        comment: null,
        receivedById: cashier.id,
      },
    });
  }
  console.log(`Seeded ${memberships.length + 1} demo payments.`);
}

/** Phase 9: finance categories and a few ledger rows for the current month. */
async function seedFinance(organizationId: string, branches: Map<string, string>) {
  const central = branches.get("Central")!;
  const categories: Array<["EXPENSE" | "INCOME", string]> = [
    ["EXPENSE", "Ijara"],
    ["EXPENSE", "Kitoblar"],
    ["EXPENSE", "Boshqalar"],
    ["INCOME", "Ichimliklar"],
    ["INCOME", "Kitoblar"],
    ["INCOME", "Boshqalar"],
  ];
  const ids = new Map<string, string>();
  for (const [i, [kind, name]] of categories.entries()) {
    const row = await prisma.financeCategory.upsert({
      where: { organizationId_kind_name: { organizationId, kind, name } },
      update: { sortOrder: i },
      create: { organizationId, kind, name, sortOrder: i },
    });
    ids.set(`${kind}:${name}`, row.id);
  }
  if ((await prisma.financeEntry.count({ where: { branchId: central } })) > 0) return;
  const cash = await prisma.paymentMethod.findFirstOrThrow({
    where: { organizationId, name: "Cash" },
  });
  const card = await prisma.paymentMethod.findFirstOrThrow({
    where: { organizationId, name: "Card" },
  });
  const ceo = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000001" } });
  const teacher = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000004" } });
  const teacherTwo = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000006" } });
  const now = new Date();
  const day = (d: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(d, 28)));
  const rows: Array<Omit<Prisma.FinanceEntryUncheckedCreateInput, "branchId">> = [
    {
      type: "EXPENSE",
      categoryId: ids.get("EXPENSE:Ijara"),
      paymentMethodId: card.id,
      amount: 8_000_000,
      date: day(1),
      comment: "Office rent",
    },
    {
      type: "EXPENSE",
      categoryId: ids.get("EXPENSE:Kitoblar"),
      paymentMethodId: cash.id,
      amount: 1_200_000,
      date: day(3),
      staffId: teacher.id,
      comment: "Course books",
    },
    {
      type: "INCOME",
      categoryId: ids.get("INCOME:Ichimliklar"),
      paymentMethodId: cash.id,
      amount: 350_000,
      date: day(5),
      comment: "Vending",
    },
    {
      type: "ADVANCE",
      paymentMethodId: cash.id,
      amount: 1_000_000,
      date: day(6),
      staffId: teacher.id,
      comment: "Advance on salary",
    },
    {
      type: "MARKETING",
      paymentMethodId: card.id,
      amount: 2_500_000,
      date: day(2),
      comment: "Instagram ads",
    },
    {
      type: "BONUS",
      paymentMethodId: cash.id,
      amount: 500_000,
      date: day(10),
      staffId: teacherTwo.id,
      comment: "Best retention",
    },
    { type: "PENALTY", amount: 150_000, date: day(12), staffId: teacher.id, comment: "Late twice" },
    {
      type: "INVESTMENT",
      amount: 50_000_000,
      date: day(1),
      counterparty: "Demo Investor",
      comment: "Seed capital",
    },
  ];
  for (const data of rows) {
    await prisma.financeEntry.create({ data: { ...data, branchId: central, createdById: ceo.id } });
  }
  console.log("Seeded demo finance rows.");
}

/** Phase 8: one upcoming and one finished group exam, plus a mock exam with registrations. */
async function seedExams(branches: Map<string, string>) {
  const central = branches.get("Central")!;
  const groups = await prisma.group.findMany({
    where: { branchId: central, name: { in: ["GE-Morning A1", "IELTS Evening"] } },
    include: {
      memberships: { where: { status: { notIn: ["ARCHIVED", "GRADUATED"] } } },
      teachers: { take: 1 },
    },
  });
  const morning = groups.find((g) => g.name === "GE-Morning A1");
  const ielts = groups.find((g) => g.name === "IELTS Evening");
  if (!morning || !ielts) return;
  const cefr = await prisma.gradingSystem.findFirst({ where: { name: "CEFR" } });
  const ieltsScale = await prisma.gradingSystem.findFirst({ where: { name: "IELTS" } });
  const room = await prisma.room.findFirst({ where: { branchId: central } });
  const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return new Date(d.toISOString().slice(0, 10) + "T00:00:00.000Z");
  };
  const examiner = morning.teachers[0]?.userId ?? null;

  const exists = async (name: string) =>
    (await prisma.exam.count({ where: { branchId: central, name } })) > 0;

  if (!(await exists("Unit 1–3 progress test"))) {
    await prisma.exam.create({
      data: {
        branchId: central,
        type: "GROUP",
        name: "Unit 1–3 progress test",
        groupId: morning.id,
        date: day(7),
        startTime: "10:00",
        endTime: "11:30",
        examinerId: examiner,
        roomId: room?.id ?? null,
        gradingSystemId: cefr?.id ?? null,
        passScore: 50,
        maxScore: 100,
      },
    });
  }
  if (!(await exists("Placement check"))) {
    const scores = [78, 42, 91, 65, 55, 88];
    await prisma.exam.create({
      data: {
        branchId: central,
        type: "GROUP",
        name: "Placement check",
        groupId: morning.id,
        date: day(-14),
        startTime: "10:00",
        endTime: "11:00",
        examinerId: examiner,
        gradingSystemId: cefr?.id ?? null,
        passScore: 50,
        maxScore: 100,
        status: "FINISHED",
        finishedAt: day(-14),
        results: {
          create: morning.memberships.map((m, i) => ({
            studentId: m.studentId,
            score: scores[i % scores.length]!,
            isPresent: true,
            gradedById: examiner,
            gradedAt: day(-14),
          })),
        },
      },
    });
  }
  if (!(await exists("IELTS Mock (October)"))) {
    await prisma.exam.create({
      data: {
        branchId: central,
        type: "MOCK",
        name: "IELTS Mock (October)",
        date: day(10),
        startTime: "09:00",
        endTime: "12:00",
        roomId: room?.id ?? null,
        gradingSystemId: ieltsScale?.id ?? null,
        passScore: 5.5,
        maxScore: 9,
        price: 150_000,
        capacity: 20,
        targets: { create: [{ groupId: morning.id }, { groupId: ielts.id }] },
        results: {
          create: ielts.memberships.slice(0, 2).map((m) => ({ studentId: m.studentId })),
        },
      },
    });
  }
  console.log("Seeded demo exams.");
}

/** Phase 7: one "Website" board per branch, a few invented leads and a public form. */
/** Phase 10: coin rules and reasons, a few awards, marketplace items, a test with results. */
async function seedCoinsAndTests(organizationId: string, branches: Map<string, string>) {
  const central = branches.get("Central")!;
  const rules: Array<["ATTENDANCE" | "HOMEWORK" | "TEST_RESULT" | "BIRTHDAY", number]> = [
    ["ATTENDANCE", 5],
    ["HOMEWORK", 10],
    ["TEST_RESULT", 20],
    ["BIRTHDAY", 50],
  ];
  for (const [event, amount] of rules) {
    await prisma.coinRule.upsert({
      where: { organizationId_event: { organizationId, event } },
      update: {},
      create: { organizationId, event, amount },
    });
  }
  const reasons: Array<[string, number]> = [
    ["Faollik", 20],
    ["Uy vazifasi", 15],
    ["Yordam", 10],
  ];
  const reasonIds = new Map<string, string>();
  for (const [name, maxCoins] of reasons) {
    const row = await prisma.coinReason.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name, maxCoins },
    });
    reasonIds.set(name, row.id);
  }

  const category = await prisma.productCategory.upsert({
    where: { organizationId_name: { organizationId, name: "Kanselyariya" } },
    update: {},
    create: { organizationId, name: "Kanselyariya" },
  });
  if ((await prisma.product.count({ where: { organizationId } })) === 0) {
    await prisma.product.createMany({
      data: [
        { organizationId, categoryId: category.id, name: "Daftar", priceCoins: 30, stock: 20 },
        { organizationId, categoryId: category.id, name: "Ruchka", priceCoins: 15, stock: 50 },
        { organizationId, categoryId: category.id, name: "Kitob", priceCoins: 120, stock: 5 },
      ],
    });
  }

  const morning = await prisma.group.findFirst({
    where: { branchId: central, name: "GE-Morning A1" },
    include: {
      memberships: {
        where: { status: { notIn: ["ARCHIVED", "GRADUATED"] } },
        orderBy: { createdAt: "asc" },
      },
      teachers: { take: 1 },
    },
  });
  if (!morning || morning.memberships.length === 0) return;
  const teacherId = morning.teachers[0]?.userId ?? null;
  const students = morning.memberships.map((m) => m.studentId);

  if ((await prisma.coinTransaction.count({ where: { groupId: morning.id } })) === 0) {
    const faollik = reasonIds.get("Faollik")!;
    await prisma.coinTransaction.createMany({
      data: students.slice(0, 3).map((studentId, i) => ({
        studentId,
        groupId: morning.id,
        kind: "MANUAL" as const,
        amount: 20 - i * 5,
        reasonId: faollik,
        comment: "Darsda faol qatnashdi",
        givenById: teacherId,
      })),
    });
  }

  if ((await prisma.questionBankItem.count({ where: { organizationId } })) === 0) {
    const bank: Array<[string, string, string[], number]> = [
      ["Present Simple", "She ___ to school every day.", ["go", "goes", "going", "gone"], 1],
      ["Present Simple", "They ___ football on Sundays.", ["plays", "play", "playing"], 1],
      ["Articles", "I saw ___ elephant at the zoo.", ["a", "an", "the", "—"], 1],
      ["Articles", "___ sun rises in the east.", ["A", "An", "The"], 2],
      ["Vocabulary", "The opposite of 'cheap' is ___.", ["expensive", "big", "old"], 0],
    ];
    await prisma.questionBankItem.createMany({
      data: bank.map(([topic, text, options, correctIndex]) => ({
        organizationId,
        subject: "English",
        topic,
        text,
        options,
        correctIndex,
        createdById: teacherId,
      })),
    });
  }
  if ((await prisma.test.count({ where: { organizationId } })) > 0) return;
  const questions = await prisma.questionBankItem.findMany({
    where: { organizationId, subject: "English" },
    orderBy: { createdAt: "asc" },
  });
  const test = await prisma.test.create({
    data: {
      organizationId,
      name: "Unit 1 grammar check",
      subject: "English",
      timeLimitMinutes: 20,
      passPercent: 60,
      status: "ACTIVE",
      createdById: teacherId,
      groups: { create: [{ groupId: morning.id }] },
      questions: {
        create: questions.map((q, i) => ({ questionId: q.id, points: 1, sortOrder: i })),
      },
    },
  });
  await prisma.test.create({
    data: {
      organizationId,
      name: "Vocabulary quiz (draft)",
      subject: "English",
      passPercent: 50,
      status: "DRAFT",
      createdById: teacherId,
      groups: { create: [{ groupId: morning.id }] },
    },
  });
  // Two submitted results: one strong, one weak on articles.
  const answerSets: Array<Record<string, number>> = [
    Object.fromEntries(questions.map((q) => [q.id, q.correctIndex])),
    Object.fromEntries(
      questions.map((q) => [
        q.id,
        q.topic === "Articles" ? (q.correctIndex + 1) % 3 : q.correctIndex,
      ]),
    ),
  ];
  for (const [i, studentId] of students.slice(0, 2).entries()) {
    const answers = answerSets[i]!;
    const score = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    await prisma.testAttempt.create({
      data: {
        testId: test.id,
        studentId,
        groupId: morning.id,
        answers,
        score,
        maxScore: questions.length,
        percent: Math.round((score / questions.length) * 10000) / 100,
        durationSeconds: 600 + i * 120,
        enteredById: teacherId,
      },
    });
  }
}

async function seedLeads(organizationId: string, branches: Map<string, string>) {
  const sources = new Map(
    (await prisma.leadSource.findMany({ where: { organizationId } })).map((s) => [s.name, s.id]),
  );
  const teacher = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000004" } });
  const columnIds = new Map<string, string>();
  for (const [name, branchId] of branches) {
    const board =
      (await prisma.leadBoard.findUnique({
        where: { branchId_name: { branchId, name: "Website" } },
      })) ??
      (await prisma.leadBoard.create({
        data: {
          branchId,
          name: "Website",
          columns: {
            create: [
              { name: "NEW LEADS", sortOrder: 0 },
              { name: "Contacted", sortOrder: 1 },
              { name: "Trial booked", sortOrder: 2 },
            ],
          },
        },
      }));
    const first = await prisma.leadColumn.findFirstOrThrow({
      where: { boardId: board.id },
      orderBy: { sortOrder: "asc" },
    });
    columnIds.set(name, first.id);
  }
  if ((await prisma.lead.count()) === 0) {
    const centralColumn = columnIds.get("Central")!;
    const columns = await prisma.leadColumn.findMany({
      where: { board: { branchId: branches.get("Central")! } },
      orderBy: { sortOrder: "asc" },
    });
    const LEADS: Array<{
      name: string;
      phone: string;
      source: string;
      column: number;
      status: "NEW" | "CONTACTED" | "UNREACHABLE" | "LOST";
      temperature: "HOT" | "WARM" | "COLD" | null;
      days: "ODD" | "EVEN" | "OTHER" | null;
      time: string | null;
      teacher?: boolean;
      comment?: string;
    }> = [
      {
        name: "Demo Lead One",
        phone: "+998901110001",
        source: "Instagram",
        column: 0,
        status: "NEW",
        temperature: "HOT",
        days: "EVEN",
        time: "09:00",
        comment: "Asked about the morning group",
      },
      {
        name: "Demo Lead Two",
        phone: "+998901110002",
        source: "Telegram",
        column: 0,
        status: "NEW",
        temperature: null,
        days: null,
        time: null,
      },
      {
        name: "Demo Lead Three",
        phone: "+998901110003",
        source: "Friend",
        column: 1,
        status: "CONTACTED",
        temperature: "WARM",
        days: "ODD",
        time: "18:00",
        teacher: true,
      },
      {
        name: "Demo Lead Four",
        phone: "+998901110004",
        source: "Website",
        column: 1,
        status: "UNREACHABLE",
        temperature: "COLD",
        days: null,
        time: null,
      },
      {
        name: "Demo Lead Five",
        phone: "+998901110005",
        source: "Walk-in",
        column: 2,
        status: "CONTACTED",
        temperature: "HOT",
        days: "EVEN",
        time: "09:00",
        teacher: true,
        comment: "Trial lesson on Thursday",
      },
    ];
    for (const [i, l] of LEADS.entries()) {
      await prisma.lead.create({
        data: {
          branchId: branches.get("Central")!,
          boardId: columns[0]!.boardId,
          columnId: columns[l.column]?.id ?? centralColumn,
          fullName: l.name,
          sourceId: sources.get(l.source) ?? null,
          teacherId: l.teacher ? teacher.id : null,
          days: l.days,
          lessonTime: l.time,
          status: l.status,
          temperature: l.temperature,
          comment: l.comment ?? null,
          sortOrder: i,
          phones: { create: [{ phone: l.phone, sortOrder: 0 }] },
        },
      });
    }
    console.log(`Seeded ${LEADS.length} demo leads.`);
  }
  await prisma.leadForm.upsert({
    where: { slug: "website" },
    update: {},
    create: {
      organizationId,
      name: "Website form",
      slug: "website",
      columnId: columnIds.get("Central")!,
      sourceId: sources.get("Website") ?? null,
      integration: "kampus-demo.example",
    },
  });
}

/** Phase 11: SMS templates and auto-SMS, a few sent messages and calls, bot recipient,
 *  integration rows with obviously fake secrets, work schedules and FaceID check-ins. */
async function seedIntegrations(organizationId: string, branches: Map<string, string>) {
  const central = branches.get("Central")!;
  const userByPhone = (phone: string) => prisma.user.findUniqueOrThrow({ where: { phone } });
  const admin = await userByPhone("+998900000002");
  const cashier = await userByPhone("+998900000003");
  const teacher = await userByPhone("+998900000004");
  const studentOne = await prisma.student.findFirstOrThrow({
    where: { fullName: "Demo Student One" },
  });
  const groupA = await prisma.group.findFirstOrThrow({
    where: { branchId: central, name: "GE-Morning A1" },
  });

  const categories: Array<[string, string[]]> = [
    [
      "To'lovlar",
      [
        "Hurmatli {studentName}, {groupName} guruhi uchun to'lov muddati {date}. {centerName}",
        "{studentName}, {amount} to'lovingiz qabul qilindi. Rahmat! {centerName}",
      ],
    ],
    [
      "Darslar",
      ["{studentName}, ertaga {groupName} guruhida dars bor. Kutib qolamiz! {centerName}"],
    ],
  ];
  for (const [name, texts] of categories) {
    const category = await prisma.smsCategory.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
    for (const text of texts) {
      const exists = await prisma.smsTemplate.findFirst({
        where: { categoryId: category.id, text },
      });
      if (!exists) {
        await prisma.smsTemplate.create({
          data: { organizationId, categoryId: category.id, text },
        });
      }
    }
  }

  const autoDefaults: Record<string, string> = {
    BIRTHDAY:
      "Hurmatli {studentName}, {centerName} jamoasi sizni tug'ilgan kuningiz bilan tabriklaydi!",
    EXAM_RESULT: "{studentName}, {groupName} guruhidagi imtihon natijangiz: {score}. {centerName}",
    PAYMENT_MADE: "{studentName}, {date} kuni {amount} to'lovingiz qabul qilindi. {centerName}",
    ABSENT: "{studentName} {date} kuni {groupName} guruhidagi darsga kelmadi. {centerName}",
    PRESENT: "{studentName} {date} kuni {groupName} guruhidagi darsga keldi. {centerName}",
    PAYMENT_DUE_SOON:
      "{studentName}, {groupName} guruhi uchun keyingi to'lov sanasi {date}. {centerName}",
    DEBTOR: "{studentName}, {groupName} guruhi bo'yicha qarzdorligingiz {debt}. {centerName}",
    GRADES: "{studentName}, {date} kuni {groupName} guruhidagi bahoingiz: {score}. {centerName}",
    DAY_BEFORE_FIRST_LESSON:
      "{studentName}, {groupName} guruhidagi birinchi dars ertaga, {date}. {centerName}",
    ADDED_TO_GROUP: "{studentName}, siz {groupName} guruhiga qo'shildingiz. {centerName}",
  };
  const activeEvents = new Set(["PAYMENT_MADE", "DEBTOR"]);
  for (const [event, template] of Object.entries(autoDefaults)) {
    const e = event as keyof typeof autoDefaults as Prisma.AutoSmsSettingCreateInput["event"];
    await prisma.autoSmsSetting.upsert({
      where: { organizationId_event: { organizationId, event: e } },
      update: {},
      create: { organizationId, event: e, template, isActive: activeEvents.has(event) },
    });
  }

  // Integration rows. Secrets here are demo placeholders, never real credentials.
  const integrations: Array<
    [Prisma.IntegrationSettingCreateInput["provider"], boolean, Record<string, unknown>]
  > = [
    ["SMS", false, { email: "", password: "", sender: "4546" }],
    ["TELEGRAM", false, { botToken: "", webhookSecret: "" }],
    ["AMOCRM", false, { secretKey: "", integrationId: "", authorizationCode: "", subDomain: "" }],
    ["TELEPHONY", true, { webhookSecret: "demo-telephony-secret" }],
    ["FACE_ID", true, { webhookSecret: "demo-face-id-secret", lateAfterMinutes: 10 }],
  ];
  for (const [provider, isEnabled, config] of integrations) {
    await prisma.integrationSetting.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      update: {},
      create: { organizationId, provider, isEnabled, config: config as Prisma.InputJsonValue },
    });
  }

  await prisma.botRecipient.upsert({
    where: { userId: admin.id },
    update: {},
    create: { organizationId, userId: admin.id, chatId: "100200300", branchIds: [] },
  });

  // Mon–Sat 09:00–18:00 for the Central staff; teachers start at 10:00.
  for (const user of [admin, cashier, teacher]) {
    const start = user.id === teacher.id ? "10:00" : "09:00";
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await prisma.workSchedule.upsert({
        where: { userId_weekday: { userId: user.id, weekday } },
        update: { start, end: "18:00" },
        create: { userId: user.id, weekday, start, end: "18:00" },
      });
    }
  }

  // FaceID check-ins for this month so far (UTC+5): admin on time, teacher late every third day,
  // cashier absent on Wednesdays.
  const now = new Date();
  const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const today = local.getUTCDate();
  const at = (day: number, hm: string) =>
    new Date(Date.UTC(year, month, day, Number(hm.slice(0, 2)) - 5, Number(hm.slice(3, 5))));
  for (let day = 1; day <= today; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const weekday = date.getUTCDay();
    if (weekday === 0) continue;
    const rows: Array<[string, string | null, string | null]> = [
      [admin.id, "08:55", day === today ? null : "18:05"],
      [teacher.id, day % 3 === 0 ? "10:25" : "09:58", day === today ? null : "17:50"],
      [cashier.id, weekday === 3 ? null : "09:02", weekday === 3 || day === today ? null : "18:00"],
    ];
    for (const [userId, checkIn, checkOut] of rows) {
      if (!checkIn) continue;
      await prisma.staffAttendance.upsert({
        where: { userId_date: { userId, date } },
        update: {},
        create: {
          userId,
          branchId: central,
          date,
          checkIn: at(day, checkIn),
          checkOut: checkOut ? at(day, checkOut) : null,
          source: "FACE_ID",
          deviceId: "demo-terminal-1",
        },
      });
    }
  }

  // A few sent messages and calls for the logs and the student's SMS / CALLS tabs.
  const messages: Array<[string, string, "SENT" | "FAILED", string | null, "PAYMENT_MADE" | null]> =
    [
      [
        "demo:sms:1",
        "Demo Student One, 2026-09-05 kuni 500 000 to'lovingiz qabul qilindi. Kampus Demo Learning Center",
        "SENT",
        null,
        "PAYMENT_MADE",
      ],
      [
        "demo:sms:2",
        "Ertaga dars 10:00 da boshlanadi. Kampus Demo Learning Center",
        "SENT",
        admin.id,
        null,
      ],
      [
        "demo:sms:3",
        "Hurmatli Demo Student One, to'lov muddati yaqinlashmoqda.",
        "FAILED",
        cashier.id,
        null,
      ],
    ];
  for (const [refKey, text, status, sentById, event] of messages) {
    await prisma.smsMessage.upsert({
      where: { refKey },
      update: {},
      create: {
        organizationId,
        branchId: central,
        recipientType: "STUDENT",
        recipientName: studentOne.fullName,
        phone: studentOne.phone ?? "+998911000000",
        studentId: studentOne.id,
        text,
        status,
        sentById,
        event,
        refKey,
        providerId: status === "SENT" ? `demo-${refKey}` : null,
        error: status === "FAILED" ? "demo: provider rejected the number" : null,
        sentAt: status === "SENT" ? new Date("2026-09-05T09:30:00Z") : null,
        createdAt: new Date("2026-09-05T09:29:00Z"),
      },
    });
  }
  const calls: Array<[string, "INBOUND" | "OUTBOUND", "ANSWERED" | "MISSED", number, string]> = [
    ["demo-call-1", "INBOUND", "ANSWERED", 185, "2026-09-10T05:12:00Z"],
    ["demo-call-2", "INBOUND", "MISSED", 0, "2026-09-12T11:40:00Z"],
    ["demo-call-3", "OUTBOUND", "ANSWERED", 64, "2026-09-15T08:05:00Z"],
  ];
  for (const [externalId, direction, status, durationSeconds, startedAt] of calls) {
    const studentPhone = studentOne.phone ?? "+998911000000";
    await prisma.callLog.upsert({
      where: { externalId },
      update: {},
      create: {
        organizationId,
        branchId: central,
        direction,
        status,
        fromPhone: direction === "INBOUND" ? studentPhone : admin.phone,
        toPhone: direction === "INBOUND" ? admin.phone : studentPhone,
        staffId: admin.id,
        studentId: studentOne.id,
        durationSeconds,
        externalId,
        startedAt: new Date(startedAt),
      },
    });
  }
  void groupA;
}

/** Phase 12: leave reasons, a couple of students who left this month and one graduate. */
async function seedReports(organizationId: string) {
  for (const [kind, name] of [
    ["LEAVE", "Daraja"],
    ["LEAVE", "Joylashuv"],
    ["LEAVE", "Narx"],
    ["LEAVE", "Vaqt"],
    ["TRANSFER", "Daraja"],
    ["TRANSFER", "Vaqt"],
  ] as const) {
    await prisma.leaveReason.upsert({
      where: { organizationId_kind_name: { organizationId, kind, name } },
      update: {},
      create: { organizationId, kind, name },
    });
  }
  const admin = await prisma.user.findUniqueOrThrow({ where: { phone: "+998900000001" } });
  const members = async (name: string) =>
    (
      await prisma.group.findFirst({
        where: { name },
        include: { memberships: { include: { student: true } } },
      })
    )?.memberships ?? [];
  const byName = (rows: Awaited<ReturnType<typeof members>>, fullName: string) =>
    rows.find((m) => m.student.fullName === fullName);
  const morning = await members("GE-Morning A1");
  const evening = await members("IELTS Evening");
  const three = byName(morning, "Demo Student Three");
  const four = byName(morning, "Demo Student Four");
  const six = byName(evening, "Demo Student Six");
  if (!three || !four || !six) return;
  if ((await prisma.graduateRecord.count()) > 0) return;
  const now = new Date();
  const day = (d: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d));
  // Students One, Two and Five stay open: the e2e specs act on them.
  await prisma.groupMembership.update({
    where: { id: three.id },
    data: { status: "ARCHIVED", leftAt: day(3), leaveReason: "Narx", leftById: admin.id },
  });
  await prisma.groupMembership.update({
    where: { id: six.id },
    data: {
      status: "ARCHIVED",
      leftAt: day(5),
      leaveReason: "transfer",
      note: "Vaqt",
      leftById: admin.id,
    },
  });
  await prisma.groupMembership.update({
    where: { id: four.id },
    data: {
      status: "GRADUATED",
      leftAt: day(2),
      graduate: {
        create: { ieltsScore: 6.5, cefrLevel: "B2", university: true, employed: false },
      },
    },
  });
  console.log("Seeded leave reasons, 2 left students and 1 graduate.");
}

/** Phase 13: a few bell notifications for the demo CEO and admin (A-97). */
async function seedNotifications() {
  if ((await prisma.notification.count()) > 0) return;
  const users = await prisma.user.findMany({
    where: { phone: { in: ["+998900000001", "+998900000002"] } },
    select: { id: true },
  });
  const student = await prisma.student.findFirst({ where: { fullName: "Demo Student One" } });
  const today = new Date().toISOString().slice(0, 10);
  for (const u of users) {
    await prisma.notification.createMany({
      data: [
        {
          userId: u.id,
          kind: "PAYMENT",
          params: {
            name: "Demo Student One",
            amount: 500000,
            group: "GE-Morning A1",
            by: "Demo Cashier",
          },
          href: student ? `/students/${student.id}` : null,
        },
        {
          userId: u.id,
          kind: "LEAD",
          params: { name: "<client name>", column: "NEW LEADS", source: "Instagram" },
          href: "/leads",
        },
        {
          userId: u.id,
          kind: "DEBTORS",
          params: { count: 2, day: today },
          href: "/students?paymentStatus=DEBTOR",
          readAt: new Date(),
        },
      ],
    });
  }
  console.log("Seeded demo notifications.");
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
      update: {
        ...profile,
        passwordHash,
        isArchived: false,
        organizationId: org.id,
        isSiteOwner: demo.roles.includes("CEO"),
      },
      create: {
        organizationId: org.id,
        isSiteOwner: demo.roles.includes("CEO"),
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
  await seedGroups(branches);
  await seedPayments(org.id);
  await seedLeads(org.id, branches);
  await seedExams(branches);
  await seedFinance(org.id, branches);
  await seedCoinsAndTests(org.id, branches);
  await seedIntegrations(org.id, branches);
  await seedReports(org.id);
  await seedNotifications();

  console.log(`Seeded ${DEMO_USERS.length} demo users across ${branchNames.length} branches.`);
  console.log(`Sign in with ${DEMO_USERS[0]!.phone} and the SEED_ADMIN_PASSWORD from .env.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
