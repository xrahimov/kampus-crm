import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { applySoffSnapshot } from "@/server/services/imports/soff-export-apply";
import { matchSnapshot, nameKey } from "@/server/services/imports/soff-export-match";
import {
  normalizeSoffExports,
  soffPhone,
  summarizeSnapshot,
  type SoffSnapshot,
} from "@/server/services/imports/soff-export-normalize";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";

/*
 * A-189: the full copy of a centre's SOFF CRM. The export below is made up, in the
 * shape the old system's API answers in; no real record is in it. It is copied into
 * a centre of its own, which is removed at the end: the copy writes payment methods,
 * leave reasons and lead boards, which every page of a centre lists.
 */

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `soff${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: "",
  branchIds: [],
  activeBranchId: null,
};

/** The export is stamped now; the centre's day is Tashkent's. */
const NOW = new Date();
const TODAY = new Date(NOW.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
const day = (offset: number) => {
  const d = isoToDate(TODAY);
  d.setUTCDate(d.getUTCDate() + offset);
  return dateToIso(d);
};
const NEXT_MONTH = (() => {
  const [y, m] = TODAY.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
})();
/** A Monday at least a week back: a lesson day of the group below. */
const LESSON_DAY = (() => {
  for (let back = 7; ; back += 1) {
    if (isoToDate(day(-back)).getUTCDay() === 1) return day(-back);
  }
})();

const expenseByCategory = {
  "1": { category: "Marketing_harajatlari", result: [expense(70, 300_000, "Instagram reklama")] },
  "3": { category: `${TAG} Kitoblar`, result: [expense(72, 80_000, "Kitob sotildi")] },
  "4": { category: `${TAG} Yoqotilgan`, result: [expense(73, 1_000, "?")] },
  "13": { category: `${TAG} Boshqalar`, result: [expense(71, 120_000, "Suv")] },
  "16": { category: `${TAG} Boshqalar`, result: [expense(80, 90_000, "Ijara")] },
};

function expense(id: number, amount: number, description: string) {
  return { id, date: day(-20), description, amount, expense_category: 0, payment_type: 1 };
}

function stay(
  id: number,
  student: number,
  status: string,
  added: string,
  deleted: string | null,
  balance: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    status,
    student: { id: student, added_at: added, deleted_at: deleted, personal_amount: null, ...extra },
    added_at: added,
    deleted_at: deleted,
    student_group_balance: balance,
    frozen_description: status === "frozen" ? { description: "Safarda" } : null,
  };
}

function urganch(balanceOfAli = -150_000, withSecondPayment = true) {
  const week = ["monday", "wednesday", "friday"].map((d, i) => ({
    id: i + 1,
    day_of_week: d,
    start_at: "14:00:00",
    end_at: "15:30:00",
    room: 1,
    room_data: { id: 1, name: `${TAG} Room A` },
  }));
  return {
    format: "soff-export/1",
    branch: 1,
    exportedAt: NOW.toISOString(),
    data: {
      branches: {
        results: [
          { id: 1, name: `${TAG} Urganch` },
          { id: 2, name: `${TAG} Shovot` },
        ],
      },
      paymentTypes: { results: [{ id: 1, name: `${TAG} Naqd`, is_active: true }] },
      leftReasons: { results: [{ id: 2, reason_text: `${TAG} Narx`, is_active: true }] },
      employeesActive: {
        results: [
          {
            id: 10,
            first_name: `${TAG} Teacher One`,
            phone: phone(10).slice(1),
            gender: "female",
            roles_list: ["teacher"],
            branches: [
              { id: 1, name: "u", exists: true },
              { id: 2, name: "s", exists: false },
            ],
            percentage: 40,
            amount: 0,
            is_fixed_salary: false,
            activated_at: day(-400),
          },
        ],
      },
      employeesArchive: {
        results: [
          {
            id: 11,
            first_name: `${TAG} Old Admin`,
            phone: phone(11),
            gender: "male",
            roles_list: ["admin"],
            branches: [{ id: 1, name: "u", exists: true }],
            amount: 2_000_000,
            is_fixed_salary: true,
          },
        ],
      },
      courses: {
        results: [
          {
            id: 3,
            name: `${TAG} English`,
            price: "450000.00",
            month_duration: 8,
            color: "#0074cc",
          },
        ],
      },
      rooms: { results: [{ id: 1, name: `${TAG} Room A`, capacity: 24, branch: { id: 1 } }] },
      groups: {
        results: [
          { id: 7, status: "active", price: 450_000, teacher: 10 },
          { id: 8, status: "archived", price: 450_000, teacher: 10 },
        ],
      },
      group: {
        "7": {
          detail: {
            id: 7,
            name: `${TAG} GE-1 new`,
            start_date: day(-200),
            end_date: day(200),
            status: "active",
            month_duration: 8,
            monthly_amount: 450_000,
            course_data: { id: 3, name: `${TAG} English` },
            day_of_week: week,
            teachers: [{ teacher: 10, role: "main", start_date: day(-200), salary_percentage: 40 }],
          },
          students: {
            current: {
              response: [
                stay(100, 500, "active", day(-70), day(200), balanceOfAli, {
                  personal_amount: { amount: 400_000 },
                }),
              ],
            },
            frozen: { response: [stay(102, 501, "frozen", day(-60), day(200), 50_000)] },
            archive: { response: [stay(99, 500, "archive", day(-200), day(-150), 0)] },
            graduates: { response: [] },
          },
          history: {
            results: [
              {
                field_changed: "name",
                old_value: `${TAG} GE-1`,
                new_value: `${TAG} GE-1 new`,
                changed_at: `${day(-10)}T10:00:00+05:00`,
              },
            ],
          },
          months: {
            [`${LESSON_DAY.slice(0, 7)}-01`]: {
              attendance: {
                current: {
                  students: [
                    {
                      id: 500,
                      attendance: [
                        mark(1, 500, LESSON_DAY, true, true),
                        mark(2, 500, day(-1), null, false),
                      ],
                    },
                  ],
                },
                frozen: {
                  students: [{ id: 501, attendance: [mark(3, 501, LESSON_DAY, false, false)] }],
                },
                archive: { students: [] },
              },
            },
          },
        },
        "8": {
          detail: {
            id: 8,
            name: `${TAG} Old group`,
            start_date: day(-400),
            end_date: day(-90),
            status: "archived",
            month_duration: 8,
            monthly_amount: 450_000,
            course_data: { id: 3, name: `${TAG} English` },
            day_of_week: [],
            teachers: [],
            teacher_data: { id: 10, first_name: "x" },
          },
          students: {
            archive: { response: [stay(103, 502, "archive", day(-300), day(-100), -20_000)] },
          },
          history: { results: [] },
          months: {},
        },
      },
      studentsBranch: {
        results: [
          student(500, `${TAG} Ali Valiev`, 1, "active", balanceOfAli, [
            { id: 100, group: 7, status: "active", next_payment: NEXT_MONTH },
          ]),
          student(501, `${TAG} Vali Aliyev`, 2, "active", 50_000, [
            { id: 102, group: 7, status: "frozen", next_payment: NEXT_MONTH },
          ]),
          student(502, `${TAG} Guli Karimova`, 3, "archive", -20_000, []),
          student(503, `${TAG} Yangi Bola`, 4, "active", 0, [
            { id: 104, group: 7, status: "new", next_payment: NEXT_MONTH },
          ]),
        ],
      },
      studentDetail: {
        "500": {
          id: 500,
          first_name: `${TAG} Ali Valiev`,
          phone: phone(1),
          gender: "male",
          created_at: `${day(-200)}T09:00:00+05:00`,
          comments: [
            {
              id: 31,
              description: "Onasi bilan gaplashildi",
              current_user: `${TAG} Teacher One`,
              created_at: `${day(-30)}T11:00:00.123456+05:00`,
            },
          ],
          parent_data: [{ id: 1, first_name: "Onasi", phone: phone(1) }],
          extra_phones: [
            { first_name: "Otasi", phone: phone(21) },
            { first_name: "O'zi", phone: phone(1) },
          ],
          groups: [],
        },
        "501": {
          id: 501,
          first_name: `${TAG} Vali Aliyev`,
          phone: phone(2),
          comments: [],
          groups: [],
        },
        "502": {
          id: 502,
          first_name: `${TAG} Guli Karimova`,
          phone: phone(3),
          comments: [],
          groups: [],
        },
        "503": {
          id: 503,
          first_name: `${TAG} Yangi Bola`,
          phone: phone(4),
          comments: [],
          groups: [],
        },
      },
      studentPayments: {
        "500": [payment(900, 500, 7, 450_000, day(-40))],
        "502": withSecondPayment ? [payment(901, 502, 8, 200_000, day(-250))] : [],
      },
      payments: { results: [] },
      paymentsReport: {
        results: [
          { ...payment(5, 500, 7, 50_000, day(-35)), condition: "refund", payment_type_name: "" },
        ],
      },
      leftStudents: {
        results: [
          {
            id: 1,
            left_reason: `${TAG} Narx`,
            left_date: day(-100),
            old_group_student: { id: 103 },
            description: "Qimmat dedi",
          },
        ],
      },
      leads: {
        departments: [
          {
            id: 59,
            name: `${TAG} Lidlar`,
            branch: 1,
            order: 1,
            children: [{ id: 60, name: "NEW LEADS", order: 1 }],
          },
        ],
        departmentsInactive: [
          {
            id: 5,
            name: `${TAG} Eski`,
            branch: 1,
            order: 2,
            children: [{ id: 7, name: "Leads 1", order: 0 }],
          },
        ],
        sources: { results: [{ id: 1, name: `${TAG} Instagram`, is_active: true }] },
        rejectedReasons: { results: [] },
        byDepartment: {
          "60": {
            active: [
              {
                id: 1,
                first_name: `${TAG} Lead A`,
                phone: phone(31),
                department: 60,
                is_active: true,
                status: "new",
                source: 1,
                created_at: `${day(-3)}T10:00:00+05:00`,
                extra_phones: {},
                lesson_day_type: [],
              },
            ],
            inactive: [],
          },
          "7": {
            active: [],
            inactive: [
              {
                id: 2,
                first_name: `${TAG} Lead B`,
                phone: phone(32),
                department: 7,
                is_active: false,
                status: "rejected",
                temperature: "hot",
                lesson_time: "15:00:00",
                lesson_day_type: ["odd_day"],
                teacher: 10,
                last_description: "Boshqa joyga ketdi",
                extra_phones: [{ phone: phone(33), first_name: "" }],
              },
            ],
          },
        },
      },
      finance: {
        prepayments: {
          results: [
            {
              id: 1,
              employee: 10,
              amount: 500_000,
              date: day(-15),
              description: "Avans",
              payment_type: 1,
            },
          ],
        },
        bonus: {
          results: [{ id: 1, employee: 10, amount: 100_000, date: day(-14), description: "Bonus" }],
        },
        fines: { results: [] },
        marketing: { results: [expense(70, 300_000, "Instagram reklama")] },
        marketingDetail: { "70": { ...expense(70, 300_000, "Instagram reklama"), branch: 1 } },
        budgetExpense: {
          "10": [
            { name: "Avans", total_expense: 1 },
            { id: 13, name: `${TAG} Boshqalar` },
          ],
        },
        budgetIncome: { "10": [{ id: 3, name: `${TAG} Kitoblar` }] },
        expenseByCategory,
      },
      examList: [
        {
          id: 5,
          title: `${TAG} Mock`,
          date: day(-25),
          min_score: 50,
          max_score: 100,
          group: { id: 7, name: "x" },
          examer: 10,
          room: 1,
          start_at: "09:00:00",
          end_at: "10:30:00",
        },
      ],
    },
  };
}

function mark(id: number, student: number, date: string, present: boolean | null, late: boolean) {
  return {
    id,
    student,
    group: 7,
    date,
    is_available: present,
    late,
    is_reason_absent: false,
    description: null,
  };
}

function student(
  id: number,
  name: string,
  phoneNo: number,
  status: string,
  balance: number,
  stays: Array<Record<string, unknown>>,
) {
  return {
    id,
    first_name: name,
    phone: phone(phoneNo),
    gender: "male",
    birth_date: null,
    status,
    balance,
    student_status: stays,
    parents: [],
  };
}

function payment(id: number, studentId: number, group: number, amount: number, date: string) {
  return {
    id,
    student: studentId,
    group,
    group_name: `${TAG} group ${group}`,
    payment_date: date,
    amount: `${amount}.00`,
    bonus: "0.00",
    refund_amount: 0,
    admin: `${TAG} Teacher One`,
    description: "",
    payment_type: 1,
    payment_type_name: `${TAG} Naqd`,
    condition: "payment",
  };
}

/** The "new" members of a group come in a second file, as they did for the real copy. */
const supplement = {
  format: "soff-export-supplement/1",
  branch: 1,
  groupStudents: { "7": { new: { response: [stay(104, 503, "new", day(-2), day(200), 0)] } } },
};

const shovot = {
  format: "soff-export/1",
  branch: 2,
  exportedAt: NOW.toISOString(),
  data: {
    branches: { results: [{ id: 2, name: `${TAG} Shovot` }] },
    paymentTypes: { results: [{ id: 1, name: `${TAG} Naqd` }] },
    employeesActive: {
      results: [
        {
          id: 10,
          first_name: `${TAG} Teacher One`,
          phone: phone(10),
          roles_list: ["teacher"],
          branches: [{ id: 2, name: "s", exists: true }],
        },
      ],
    },
    courses: { results: [{ id: 9, name: `${TAG} Kids`, price: "300000.00", month_duration: 12 }] },
    rooms: { results: [] },
    groups: { results: [{ id: 20, status: "active" }] },
    group: {
      "20": {
        detail: {
          id: 20,
          name: `${TAG} Kids-1`,
          start_date: day(-100),
          end_date: day(265),
          status: "active",
          monthly_amount: 300_000,
          course_data: { id: 9, name: `${TAG} Kids` },
          day_of_week: [
            { day_of_week: "tuesday", start_at: "10:00:00", end_at: "11:00:00", room: null },
          ],
          teachers: [{ teacher: 10, role: "main", start_date: day(-100), salary_percentage: 30 }],
        },
        students: {
          current: { response: [stay(200, 600, "active", day(-90), day(265), -30_000)] },
        },
        history: { results: [] },
        months: {},
      },
    },
    studentsBranch: {
      results: [
        student(600, `${TAG} Shovotlik Bola`, 5, "active", -30_000, [
          { id: 200, group: 20, status: "active", next_payment: NEXT_MONTH },
        ]),
      ],
    },
    studentDetail: {
      "600": { id: 600, first_name: `${TAG} Shovotlik Bola`, phone: phone(5), groups: [] },
    },
    studentPayments: {},
    leads: { departments: [], departmentsInactive: [], byDepartment: {} },
    finance: {
      budgetExpense: { "10": [{ id: 16, name: `${TAG} Boshqalar` }] },
      budgetIncome: {},
      // The old system answers with every branch's rows whichever branch asks.
      expenseByCategory,
    },
    examList: [],
  },
};

let orgId = "";
let urganchId: string;
let shovotId: string;
let kampusGroupId: string;
let aliId: string;
let aliMembershipId: string;

const branchIds = () => [urganchId, shovotId];
const snapshotOf = (...args: Parameters<typeof urganch>): SoffSnapshot =>
  normalizeSoffExports([shovot, supplement, urganch(...args)]);
const apply = (snapshot: SoffSnapshot, dryRun: boolean) =>
  applySoffSnapshot(snapshot, { organizationId: orgId, dryRun });

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { name: `${TAG} Centre` } })).id;
  ceo.organizationId = orgId;
  const user = await prisma.user.create({
    data: {
      phone: phone(99),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: orgId,
    },
  });
  ceo.userId = user.id;
  urganchId = (await createBranch(ceo, { name: `${TAG} Urganch`, isActive: true })).id;
  shovotId = (await createBranch(ceo, { name: `${TAG} Shovot`, isActive: true })).id;
  ceo.branchIds = [urganchId, shovotId];
  ceo.activeBranchId = urganchId;

  // What an earlier, partial migration left in Kampus: the group under its old name,
  // one student with a differently typed name, joined "on the first of the month".
  const courseId = (
    await createCourse(ceo, {
      branchId: urganchId,
      name: `${TAG} English`,
      description: undefined,
      price: 400_000,
      durationMonths: 8,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  kampusGroupId = (
    await createGroup(ceo, {
      branchId: urganchId,
      name: `${TAG} GE-1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "16:00",
        endTime: "17:30",
        roomId: null,
      })),
      teachers: [],
      startDate: day(-200),
      endDate: day(200),
      status: "ACTIVE",
      ignoreClashes: true,
    })
  ).id;
  const ali = await prisma.student.create({
    data: { branchId: urganchId, fullName: `${TAG} Aliy Valiyev`, phone: phone(1) },
  });
  aliId = ali.id;
  const membership = await prisma.groupMembership.create({
    data: {
      groupId: kampusGroupId,
      studentId: ali.id,
      status: "ACTIVE",
      joinedAt: isoToDate(day(-45)),
      activatedAt: isoToDate(day(-45)),
      note: "Real start earlier",
    },
  });
  aliMembershipId = membership.id;
  const stranger = await prisma.student.create({
    data: { branchId: urganchId, fullName: `${TAG} Kampus Only`, phone: phone(50) },
  });
  await prisma.groupMembership.create({
    data: {
      groupId: kampusGroupId,
      studentId: stranger.id,
      status: "ACTIVE",
      joinedAt: isoToDate(day(-45)),
    },
  });
  // Kampus has been charging the student since that made-up join date.
  await membershipBalances(prisma, [membership.id]);
});

afterAll(async () => {
  // A failed set-up leaves the id unset; an unset filter would match every centre.
  if (!orgId) return;
  const inBranches = { branchId: { in: [urganchId, shovotId].filter(Boolean) } };
  await prisma.auditLog.deleteMany({ where: { OR: [inBranches, { organizationId: orgId }] } });
  await prisma.exam.deleteMany({ where: inBranches });
  await prisma.financeEntry.deleteMany({ where: inBranches });
  await prisma.financeCategory.deleteMany({ where: { organizationId: orgId } });
  await prisma.lead.deleteMany({ where: inBranches });
  await prisma.leadBoard.deleteMany({ where: inBranches });
  await prisma.legacyPayment.deleteMany({ where: inBranches });
  await prisma.balanceAdjustment.deleteMany({ where: inBranches });
  await prisma.debtCase.deleteMany({ where: inBranches });
  await prisma.group.deleteMany({ where: inBranches });
  await prisma.student.deleteMany({ where: inBranches });
  await prisma.course.deleteMany({ where: inBranches });
  await prisma.room.deleteMany({ where: inBranches });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("normalizeSoffExports (A-189)", () => {
  const snapshot = snapshotOf();

  it("reads phones in any spelling and compares names loosely", () => {
    expect(soffPhone("998901234567")).toBe("+998901234567");
    expect(soffPhone("90 123 45 67")).toBe("+998901234567");
    expect(soffPhone("")).toBeNull();
    expect(nameKey("  Go`zal   ALIYEVA ")).toBe(nameKey("goʻzal aliyeva"));
  });

  it("folds every stay of a student in a group into one membership", () => {
    const ali = snapshot.memberships.find((m) => m.ext === "7:500")!;
    expect(ali).toMatchObject({
      status: "ACTIVE",
      joinedAt: day(-70),
      leftAt: null,
      customPrice: 400_000,
      balance: -150_000,
      billingFrom: NEXT_MONTH,
      frozenAt: null,
    });
    expect(ali.note).toContain(day(-200));
    expect(snapshot.memberships.filter((m) => m.groupExt === "7")).toHaveLength(3);
  });

  it("keeps a frozen, a new and a gone member out of Kampus's charging", () => {
    const frozen = snapshot.memberships.find((m) => m.ext === "7:501")!;
    expect(frozen).toMatchObject({
      status: "FROZEN",
      frozenAt: snapshot.exportedAt,
      balance: 50_000,
    });
    expect(frozen.note).toContain("Safarda");
    const fresh = snapshot.memberships.find((m) => m.ext === "7:503")!;
    expect(fresh).toMatchObject({ status: "NEW", billingFrom: null });
    const gone = snapshot.memberships.find((m) => m.ext === "8:502")!;
    expect(gone).toMatchObject({
      status: "ARCHIVED",
      leftAt: day(-100),
      billingFrom: day(-99),
      leaveReason: `${TAG} Narx`,
      balance: -20_000,
    });
    expect(gone.note).toContain("Qimmat dedi");
  });

  it("takes shared rows once and gives each expense the branch of its category", () => {
    const row = (ext: string) => snapshot.finance.find((f) => f.ext === ext)!;
    expect(row("ROW:71")).toMatchObject({
      type: "EXPENSE",
      branchExt: "1",
      category: `${TAG} Boshqalar`,
    });
    expect(row("ROW:72")).toMatchObject({ type: "INCOME", branchExt: "1" });
    expect(row("ROW:70")).toMatchObject({ type: "MARKETING", branchExt: "1", category: null });
    expect(row("ROW:80")).toMatchObject({ type: "EXPENSE", branchExt: "2" });
    expect(row("ADVANCE:1")).toMatchObject({ staffExt: "10", amount: 500_000 });
    expect(snapshot.finance).toHaveLength(7);
    expect(snapshot.warnings.join(" ")).toContain("1 expense rows");
    expect(snapshot.staff).toHaveLength(2);
    expect(snapshot.staff.find((s) => s.ext === "10")!.branchExts.sort()).toEqual(["1", "2"]);
  });

  it("keeps payments as history, a refund as a negative row, and attendance per lesson", () => {
    expect(snapshot.payments.map((p) => p.amount).sort((a, b) => a - b)).toEqual([
      -50_000, 200_000, 450_000,
    ]);
    expect(snapshot.lessons).toHaveLength(1);
    expect(snapshot.lessons[0]!.marks).toEqual([
      { studentExt: "1:500", status: "PRESENT", comment: "Kechikdi" },
      { studentExt: "1:501", status: "ABSENT", comment: null },
    ]);
  });

  it("builds lead boards only for departments that hold leads, and keeps parents", () => {
    expect(snapshot.leadBoards.map((b) => b.name).sort()).toEqual([`${TAG} Eski`, `${TAG} Lidlar`]);
    const lost = snapshot.leads.find((l) => l.ext === "2")!;
    expect(lost).toMatchObject({
      status: "LOST",
      archived: true,
      temperature: "HOT",
      days: "ODD",
      lessonTime: "15:00",
      teacherExt: "10",
      column: "Leads 1",
    });
    expect(lost.phones).toEqual([phone(32), phone(33)]);
    const ali = snapshot.students.find((s) => s.ext === "1:500")!;
    expect(ali.parents).toEqual([
      { fullName: "Onasi", phone: phone(1) },
      { fullName: "Otasi", phone: phone(21) },
    ]);
    expect(snapshot.groups.find((g) => g.ext === "7")!.previousNames).toEqual([`${TAG} GE-1`]);
    const summary = summarizeSnapshot(snapshot) as {
      perBranch: Array<{ owing: { total: number } }>;
    };
    expect(summary.perBranch.map((b) => b.owing.total)).toEqual([-170_000, -30_000]);
  });

  it("refuses a file that is not an export", () => {
    expect(() => normalizeSoffExports([{ format: "other" }])).toThrow(/Not a SOFF export/);
    expect(() => normalizeSoffExports([supplement])).toThrow(/No SOFF export/);
  });
});

describe("matchSnapshot (A-189)", () => {
  // Two groups that swapped names, a person the old system holds twice, an empty group.
  const base = snapshotOf();
  const group = (ext: string, name: string, previousNames: string[] = []) => ({
    ...base.groups[0]!,
    ext,
    branchExt: "1",
    name,
    previousNames,
  });
  const person = (oldId: string, fullName: string, phoneNo: number, archived = false) => ({
    ...base.students[0]!,
    ext: `1:${oldId}`,
    oldId,
    branchExt: "1",
    fullName,
    phone: phone(phoneNo),
    archived,
  });
  const member = (groupExt: string, oldId: string) => ({
    ...base.memberships[0]!,
    ext: `${groupExt}:${oldId}`,
    groupExt,
    studentExt: `1:${oldId}`,
  });
  const snapshot: SoffSnapshot = {
    ...base,
    groups: [
      group("1", "Beta", ["Alpha"]),
      group("2", "Alpha", ["Beta"]),
      group("3", "Gamma new", ["Gamma"]),
    ],
    students: [
      person("10", "Ali Valiev", 61),
      person("11", "Vali Aliev", 62),
      person("12", "Twin Person", 63, true),
      person("13", "Twin Person", 63),
      person("14", "Typed Differently", 64),
    ],
    memberships: [member("1", "10"), member("2", "11"), member("1", "12"), member("2", "13")],
  };
  const kampus = {
    students: [
      { id: "k10", branchExt: "1", fullName: "ali  valiev", phone: phone(61) },
      { id: "k11", branchExt: "1", fullName: "Vali Aliev", phone: phone(62) },
      { id: "k12", branchExt: "1", fullName: "Twin Person", phone: phone(63) },
      { id: "k14", branchExt: "1", fullName: "Typed Diferently", phone: phone(64) },
      { id: "kOther", branchExt: "2", fullName: "Ali Valiev", phone: phone(61) },
    ],
    // In Kampus the groups still carry the names from before the swap.
    groups: [
      { id: "kgAlpha", branchExt: "1", name: "Alpha" },
      { id: "kgBeta", branchExt: "1", name: "Beta" },
      { id: "kgGamma", branchExt: "1", name: "Gamma" },
    ],
    members: [
      { groupId: "kgAlpha", studentId: "k10" },
      { groupId: "kgAlpha", studentId: "k12" },
      { groupId: "kgBeta", studentId: "k11" },
    ],
  };

  it("pairs groups by the students they share, not by a name that moved", () => {
    const result = matchSnapshot({
      snapshot,
      ...kampus,
      studentRefs: new Map(),
      groupRefs: new Map(),
    });
    expect(Object.fromEntries(result.groups)).toEqual({
      "1": "kgAlpha",
      "2": "kgBeta",
      "3": "kgGamma",
    });
    expect(result.groupsBy).toEqual({ ref: 0, members: 2, name: 0, earlierName: 1 });
  });

  it("tells a person the old system holds twice apart by the group, and never crosses branches", () => {
    const result = matchSnapshot({
      snapshot,
      ...kampus,
      studentRefs: new Map(),
      groupRefs: new Map(),
    });
    expect(Object.fromEntries(result.students)).toEqual({
      "1:10": "k10",
      "1:11": "k11",
      "1:12": "k12",
      "1:14": "k14",
    });
    expect(result.studentsBy).toEqual({ ref: 0, phoneAndName: 2, phone: 1, name: 0, twin: 1 });
  });

  it("keeps what an earlier run paired", () => {
    const result = matchSnapshot({
      snapshot,
      ...kampus,
      studentRefs: new Map([["1:13", "k12"]]),
      groupRefs: new Map([["2", "kgAlpha"]]),
    });
    expect(result.students.get("1:13")).toBe("k12");
    expect(result.students.has("1:12")).toBe(false);
    expect(result.groups.get("2")).toBe("kgAlpha");
  });
});

describe("applySoffSnapshot (A-189)", () => {
  const counts = async () => ({
    students: await prisma.student.count({ where: { branchId: { in: branchIds() } } }),
    groups: await prisma.group.count({ where: { branchId: { in: branchIds() } } }),
    memberships: await prisma.groupMembership.count({
      where: { group: { branchId: { in: branchIds() } } },
    }),
    legacy: await prisma.legacyPayment.count({ where: { branchId: { in: branchIds() } } }),
    finance: await prisma.financeEntry.count({ where: { branchId: { in: branchIds() } } }),
    leads: await prisma.lead.count({ where: { branchId: { in: branchIds() } } }),
    marks: await prisma.attendance.count({
      where: { lesson: { group: { branchId: { in: branchIds() } } } },
    }),
    refs: await prisma.importRef.count({
      where: { organizationId: orgId, kind: "student", entityId: aliId },
    }),
  });
  let dryCounts: unknown;

  it("a dry run reports the copy and writes nothing", async () => {
    const before = await counts();
    const report = await apply(snapshotOf(), true);
    expect(report.dryRun).toBe(true);
    expect(report.counts.students).toMatchObject({ created: 4, updated: 1 });
    expect(report.counts.groups).toMatchObject({ created: 2, updated: 1 });
    expect(report.studentMatches).toMatchObject({ phone: 1, phoneAndName: 0, name: 0, ref: 0 });
    expect(report.groupMatches).toEqual({ ref: 0, members: 1, name: 0, earlierName: 0 });
    expect(report.newStaffRoles).toEqual({ TEACHER: 1 });
    expect(report.kampusOnly).toMatchObject({ students: 1, groups: 0, memberships: 1 });
    expect(await counts()).toEqual(before);
    expect(
      await prisma.group.findUnique({ where: { id: kampusGroupId }, select: { name: true } }),
    ).toEqual({
      name: `${TAG} GE-1`,
    });
    dryCounts = report.counts;
  });

  it("the real run does what the dry run said, and the balances equal the old system's", async () => {
    const report = await apply(snapshotOf(), false);
    expect(report.counts).toEqual(dryCounts);
    expect(report.money).toEqual([
      {
        branch: `${TAG} Urganch`,
        expected: { owing: 2, owingTotal: -170_000, credit: 1, creditTotal: 50_000 },
        kampus: { owing: 2, owingTotal: -170_000, credit: 1, creditTotal: 50_000 },
      },
      {
        branch: `${TAG} Shovot`,
        expected: { owing: 1, owingTotal: -30_000, credit: 0, creditTotal: 0 },
        kampus: { owing: 1, owingTotal: -30_000, credit: 0, creditTotal: 0 },
      },
    ]);
    expect(await counts()).toMatchObject({
      students: 6,
      groups: 3,
      memberships: 6,
      legacy: 3,
      finance: 7,
      leads: 2,
      marks: 2,
      refs: 1,
    });
  });

  it("brings the record the centre already had up to date instead of adding a second one", async () => {
    const group = await prisma.group.findUniqueOrThrow({
      where: { id: kampusGroupId },
      select: {
        name: true,
        weekdayPattern: true,
        slots: { select: { weekday: true, startTime: true }, orderBy: { weekday: "asc" } },
        teachers: { select: { user: { select: { fullName: true } }, shareValue: true } },
        course: { select: { price: true } },
      },
    });
    expect(group.name).toBe(`${TAG} GE-1 new`);
    expect(group.weekdayPattern).toBe("ODD");
    expect(group.slots.map((s) => s.weekday)).toEqual([1, 3, 5]);
    expect(group.teachers.map((t) => t.user.fullName)).toEqual([`${TAG} Teacher One`]);
    expect(Number(group.course.price)).toBe(450_000);

    const ali = await prisma.student.findUniqueOrThrow({
      where: { id: aliId },
      select: {
        fullName: true,
        parents: { select: { phone: true } },
        comments: { select: { text: true, createdById: true } },
      },
    });
    expect(ali.fullName).toBe(`${TAG} Ali Valiev`);
    expect(ali.parents.map((p) => p.phone).sort()).toEqual([phone(1), phone(21)]);
    expect(ali.comments).toHaveLength(1);
    expect(ali.comments[0]!.createdById).not.toBeNull();

    const membership = await prisma.groupMembership.findUniqueOrThrow({
      where: { id: aliMembershipId },
      select: { joinedAt: true, billingFrom: true, customPrice: true, note: true, charges: true },
    });
    expect(dateToIso(membership.joinedAt)).toBe(day(-70));
    expect(dateToIso(membership.billingFrom!)).toBe(NEXT_MONTH);
    expect(Number(membership.customPrice)).toBe(400_000);
    expect(membership.note).toContain("Avval ham");
    // The months Kampus charged on its own are inside the opening balance now.
    expect(membership.charges.filter((c) => Number(c.amount) > 0)).toEqual([]);
    const balance = (await membershipBalances(prisma, [aliMembershipId])).get(aliMembershipId)!;
    expect(balance.balance).toBe(-150_000);
  });

  it("creates staff who cannot sign in with a password, archived ones archived", async () => {
    const teacher = await prisma.user.findUniqueOrThrow({
      where: { phone: phone(10) },
      select: {
        isArchived: true,
        mustChangePassword: true,
        percentShare: true,
        roles: { select: { role: { select: { code: true } } } },
        branches: { select: { branchId: true } },
      },
    });
    expect(teacher.isArchived).toBe(false);
    expect(teacher.mustChangePassword).toBe(true);
    expect(Number(teacher.percentShare)).toBe(40);
    expect(teacher.roles.map((r) => r.role.code)).toEqual(["TEACHER"]);
    expect(teacher.branches.map((b) => b.branchId).sort()).toEqual(branchIds().sort());
    const admin = await prisma.user.findUniqueOrThrow({
      where: { phone: phone(11) },
      select: { isArchived: true, salaryMethod: true },
    });
    expect(admin).toEqual({ isArchived: true, salaryMethod: "MONTHLY" });
  });

  it("writes attendance on the lesson of that day, leads on their boards and finance per branch", async () => {
    const marks = await prisma.attendance.findMany({
      where: { lesson: { groupId: kampusGroupId } },
      select: { status: true, comment: true, lesson: { select: { date: true, startTime: true } } },
      orderBy: { status: "asc" },
    });
    expect(
      marks.map((m) => [m.status, m.comment, dateToIso(m.lesson.date), m.lesson.startTime]),
    ).toEqual([
      ["PRESENT", "Kechikdi", LESSON_DAY, "14:00"],
      ["ABSENT", null, LESSON_DAY, "14:00"],
    ]);
    const leads = await prisma.lead.findMany({
      where: { branchId: urganchId },
      select: {
        fullName: true,
        isArchived: true,
        status: true,
        board: { select: { name: true } },
        phones: true,
      },
      orderBy: { fullName: "asc" },
    });
    expect(leads.map((l) => [l.board.name, l.status, l.isArchived, l.phones.length])).toEqual([
      [`${TAG} Lidlar`, "NEW", false, 1],
      [`${TAG} Eski`, "LOST", true, 2],
    ]);
    const finance = await prisma.financeEntry.groupBy({
      by: ["branchId", "type"],
      where: { branchId: { in: branchIds() } },
      _count: true,
    });
    const tally = Object.fromEntries(
      finance.map((f) => [`${f.branchId === urganchId ? "U" : "S"}/${f.type}`, f._count]),
    );
    expect(tally).toEqual({
      "U/ADVANCE": 1,
      "U/BONUS": 1,
      "U/EXPENSE": 2,
      "U/INCOME": 1,
      "U/MARKETING": 1,
      "S/EXPENSE": 1,
    });
    const exam = await prisma.exam.findFirstOrThrow({
      where: { branchId: urganchId, name: `${TAG} Mock` },
      select: { status: true, groupId: true, examinerId: true },
    });
    expect(exam).toMatchObject({ status: "FINISHED", groupId: kampusGroupId });
    expect(exam.examinerId).not.toBeNull();
  });

  it("a second run of the same copy changes nothing", async () => {
    const before = await counts();
    const report = await apply(snapshotOf(), false);
    for (const [kind, c] of Object.entries(report.counts)) {
      expect([kind, c.created, c.updated, c.removed]).toEqual([kind, 0, 0, 0]);
    }
    expect(report.studentMatches.ref).toBe(5);
    expect(await counts()).toEqual(before);
  });

  it("a later copy updates balances and removes a payment that is gone in the old system", async () => {
    const report = await apply(snapshotOf(-100_000, false), false);
    expect(report.counts.openingBalances).toMatchObject({ updated: 1, created: 0 });
    expect(report.counts.payments).toMatchObject({ removed: 1, created: 0 });
    expect(report.counts.students).toMatchObject({ created: 0 });
    expect(report.money[0]).toMatchObject({
      expected: { owing: 2, owingTotal: -120_000 },
      kampus: { owing: 2, owingTotal: -120_000 },
    });
    expect((await counts()).legacy).toBe(2);
    const balance = (await membershipBalances(prisma, [aliMembershipId])).get(aliMembershipId)!;
    expect(balance.balance).toBe(-100_000);
  });

  it("stops when the centre has no branch of that name", async () => {
    const snapshot = snapshotOf();
    snapshot.branches[0]!.name = `${TAG} Nowhere`;
    await expect(apply(snapshot, true)).rejects.toThrow(/no branch named/);
  });
});
