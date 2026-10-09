import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  detectSoffFile,
  groupNamesIn,
  runSoffImport,
  splitTimeRange,
} from "@/server/services/imports/soff-import.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { membershipBalances } from "@/server/services/students/balances";
import { listStudentPaymentHistory } from "@/server/services/students/history-import.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `soff${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  await createCourse(ceo, {
    branchId,
    name: `${TAG} Ingliz tili`,
    description: undefined,
    price: 500_000,
    durationMonths: 6,
    gradingSystemId: null,
    color: null,
  });
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.legacyPayment.deleteMany({ where: { branchId } });
  await prisma.balanceAdjustment.deleteMany({ where: { branchId } });
  await prisma.auditLog.deleteMany({ where: { branchId } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.groupTeacher.deleteMany({ where: { group: { branchId } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { user: { phone: { startsWith: `+99896${RUN}` } } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("SOFF CRM importer (A-143)", () => {
  it("parses the vendor's time ranges and group cells", () => {
    expect(splitTimeRange("09:00 - 10:30")).toEqual(["09:00", "10:30"]);
    expect(splitTimeRange("9.00 – 10.30")).toEqual(["09:00", "10:30"]);
    expect(splitTimeRange("")).toEqual([null, null]);
    expect(
      groupNamesIn("09:00 - 10:30 – Ingliz A1 – Ali\n14:00 - 15:30 – Ingliz A1 Plus – Vali", [
        "Ingliz A1",
        "Ingliz A1 Plus",
        "Nemis B1",
      ]),
    ).toEqual(["Ingliz A1", "Ingliz A1 Plus"]);
  });

  it("recognises each export by its headers", () => {
    const staff = detectSoffFile([
      [
        "#",
        "Ism familiya",
        "Telefon raqam",
        "Doimiy oylik",
        "Foiz ulush (%)",
        "Kasbi",
        "Ishga olingan sana",
      ],
      ["1", "A", "+998901234567", "0", "40", "o'qituvchi", "2025-01-10"],
    ]);
    expect(staff.kind).toBe("staff");
    expect(staff.columns).toMatchObject({
      fullName: "Ism familiya",
      roles: "Kasbi",
      hireDate: "Ishga olingan sana",
    });
    expect(staff.unknown).toEqual(["#"]);
    expect(staff.rows).toBe(1);

    expect(
      detectSoffFile([
        ["ID", "Guruh nomi", "Kurs", "O'qituvchi", "Dars Kunlari", "Dars vaqti", "Status"],
      ]).kind,
    ).toBe("groups");
    expect(
      detectSoffFile([["ID", "Ism familiya", "Baho", "Telefon", "Guruhlar", "Balans"]]).kind,
    ).toBe("students");
    expect(
      detectSoffFile([
        ["ID", "SANA", "QAYSI OY UCHUN", "SUMMA", "GURUH", "TO'LOV TURI", "O'QUVCHI"],
      ]).kind,
    ).toBe("payments");
    const unknown = detectSoffFile([
      ["Foo", "Bar"],
      ["1", "2"],
    ]);
    expect(unknown.kind).toBeNull();
    expect(unknown.unknown).toEqual(["Foo", "Bar"]);
  });

  it("feeds staff, groups, students and payments to the Kampus importers", async () => {
    // Staff: a teacher the group file names.
    const staffRows = [
      [
        "Ism familiya",
        "Telefon raqam",
        "Doimiy oylik",
        "Foiz ulush (%)",
        "Kasbi",
        "Ishga olingan sana",
      ],
      [`${TAG} Ustoz`, phone(10), "0", "40", "o'qituvchi", "10.01.2025"],
      [`${TAG} Nophone`, "", "0", "0", "admin", ""],
    ];
    await expect(
      runSoffImport(ceo, { kind: "groups", branchId, dryRun: true }, staffRows),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const staffPreview = await runSoffImport(
      ceo,
      { kind: "staff", branchId, dryRun: true },
      staffRows,
    );
    expect(staffPreview.imported).toBe(1);
    expect(staffPreview.skipped).toEqual([{ row: 3, reason: "phone: validation.phone" }]);
    const staff = await runSoffImport(ceo, { kind: "staff", branchId, dryRun: false }, staffRows);
    expect(staff.imported).toBe(1);
    expect(staff.logins).toHaveLength(1);
    const teacher = await prisma.user.findUniqueOrThrow({ where: { phone: phone(10) } });
    expect(teacher.hireDate?.toISOString().slice(0, 10)).toBe("2025-01-10");

    // Groups: lesson time as one "HH:MM - HH:MM" cell, status in Uzbek.
    const groupRows = [
      [
        "ID",
        "Guruh nomi",
        "Kurs",
        "O'qituvchi",
        "Support ustoz",
        "Dars Kunlari",
        "Dars vaqti",
        "O'quvchilar soni",
        "Ochilgan",
        "Yakunlanadi",
        "Status",
      ],
      [
        "7",
        `${TAG} A1`,
        `${TAG} Ingliz tili`,
        `${TAG} Ustoz`,
        "",
        "Toq kunlari",
        "09:00 - 10:30",
        "12",
        "01.09.2026",
        "",
        "Faol",
      ],
      ["8", "", `${TAG} Ingliz tili`, "", "", "Juft kunlari", "11:00 - 12:30", "0", "", "", "Faol"],
    ];
    const groups = await runSoffImport(ceo, { kind: "groups", branchId, dryRun: false }, groupRows);
    expect(groups.imported).toBe(1);
    expect(groups.skipped).toEqual([{ row: 3, reason: "name: validation.required" }]);
    const group = await prisma.group.findFirstOrThrow({
      where: { branchId, name: `${TAG} A1` },
      include: { slots: true, teachers: true },
    });
    expect(group.weekdayPattern).toBe("ODD");
    expect(group.slots[0]).toMatchObject({ startTime: "09:00", endTime: "10:30" });
    expect(group.teachers.map((t) => t.userId)).toEqual([teacher.id]);

    // Students: the group cell and the balance go in too.
    const studentRows = [
      ["ID", "Ism familiya", "Baho", "Keyingi to'lov", "Telefon", "Izoh", "Guruhlar", "Balans"],
      [
        "101",
        `${TAG} Bola`,
        "Bahosi yo'q",
        "2026-11-01",
        phone(20),
        "from soff",
        `09:00 - 10:30 – ${TAG} A1 – ${TAG} Ustoz`,
        "-300 000",
      ],
      ["102", `${TAG} Yangi`, "", "", phone(21), "", "", "0"],
      ["103", `${TAG} Bola`, "", "", phone(20), "", "", ""],
    ];
    const studentPreview = await runSoffImport(
      ceo,
      { kind: "students", branchId, dryRun: true },
      studentRows,
    );
    expect(studentPreview.imported).toBe(2);
    expect(studentPreview.skipped).toEqual([{ row: 4, reason: "errors.importDuplicate" }]);
    expect(studentPreview.extra).toEqual([
      { key: "members", imported: 1, skipped: 0 },
      { key: "balances", imported: 1, skipped: 0 },
    ]);
    expect(await prisma.student.count({ where: { branchId } })).toBe(0);
    const students = await runSoffImport(
      ceo,
      { kind: "students", branchId, dryRun: false },
      studentRows,
    );
    expect(students.imported).toBe(2);
    expect(students.extra).toEqual([
      { key: "members", imported: 1, skipped: 0 },
      { key: "balances", imported: 1, skipped: 0 },
    ]);
    const bola = await prisma.student.findFirstOrThrow({
      where: { branchId, phone: phone(20) },
      include: { memberships: true },
    });
    expect(bola.memberships).toHaveLength(1);
    expect(bola.memberships[0]!.groupId).toBe(group.id);
    const balance = (await membershipBalances(prisma, [bola.memberships[0]!.id])).get(
      bola.memberships[0]!.id,
    )!;
    expect(balance.adjusted).toBe(-300_000);
    // The same file again adds nobody.
    const again = await runSoffImport(
      ceo,
      { kind: "students", branchId, dryRun: false },
      studentRows,
    );
    expect(again.imported).toBe(0);
    expect(again.skipped.map((s) => s.reason)).toEqual([
      "errors.importExists",
      "errors.importExists",
      "errors.importDuplicate",
    ]);

    // Payments: history rows, a refund as a negative row, the month in the comment.
    const paymentRows = [
      [
        "ID",
        "SANA",
        "QAYSI OY UCHUN",
        "TURI",
        "SUMMA",
        "QAYTARILGAN SUMMA",
        "BONUS",
        "GURUH",
        "IZOH",
        "YARATILGAN VAQT",
        "TO'LOV TURI",
        "QABUL QILDI",
        "O'QUVCHI",
      ],
      [
        "1",
        "05.09.2026",
        "Sentabr",
        "To'lov",
        "500 000",
        "100 000",
        "0",
        `${TAG} A1`,
        "",
        "2026-09-05 10:00",
        "Naqd",
        "Kassir",
        `${TAG} Bola`,
      ],
      ["2", "", "", "", "100", "", "", "", "", "", "", "", `${TAG} Bola`],
    ];
    const payments = await runSoffImport(
      ceo,
      { kind: "payments", branchId, dryRun: false },
      paymentRows,
    );
    expect(payments.imported).toBe(2);
    expect(payments.skipped).toEqual([{ row: 3, reason: "paidAt: validation.date" }]);
    const history = await listStudentPaymentHistory(ceo, bola.id);
    expect(history.map((h) => [h.amount, h.comment, h.method]).sort()).toEqual(
      [
        [500_000, "Sentabr", "Naqd"],
        [-100_000, "refund", "Naqd"],
      ].sort(),
    );
    expect(balance.adjusted).toBe(-300_000);
  });
});
