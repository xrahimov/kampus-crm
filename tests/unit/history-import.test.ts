import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { getChurnReport } from "@/server/services/reports/churn.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  deleteLegacyPayment,
  importArchivedStudents,
  importPaymentHistory,
  listStudentPaymentHistory,
} from "@/server/services/students/history-import.service";
import { getStudent, createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `hist${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const cashier: Actor = {
  ...ceo,
  fullName: "Cashier",
  roles: ["CASHIER"],
  permissions: ["students.view", "payments.create"],
};

let branchId: string;
let groupId: string;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [cashier, 2],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${a.fullName}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    a.userId = user.id;
  }
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  cashier.branchIds = [branchId];
  await prisma.userBranch.create({ data: { userId: cashier.userId, branchId } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Old Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [{ weekday: 1, startTime: "10:00", endTime: "11:30", roomId: null }],
      teachers: [],
      startDate: "2025-09-01",
      endDate: null,
      status: "ACTIVE",
      ignoreClashes: true,
    })
  ).id;
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.legacyPayment.deleteMany({ where: { branchId } });
  await prisma.auditLog.deleteMany({ where: { branchId } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.student.deleteMany({ where: { id: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99895${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("archived students and payment history import (A-142)", () => {
  it("creates archived students with closed memberships the churn report counts", async () => {
    // An active student the file also names: skipped, never archived.
    const active = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Active`,
      phone: phone(10),
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: null,
    });
    const rows = [
      ["Ism", "Telefon", "Guruh", "Kelgan", "Ketgan", "Sabab", "Izoh"],
      [`${TAG} Gone One`, phone(20), `${TAG} Old Group`, "2025-09-01", "2026-03-15", "moved", ""],
      [`${TAG} Gone Two`, "", "", "", "15.02.2026", "", "no phone"],
      [`${TAG} Gone Two`, "", "", "", "2026-02-15", "", "same name again"],
      [`${TAG} Active`, phone(10), "", "", "2026-01-01", "", ""],
      [`${TAG} Bad Group`, phone(21), "No Such Group", "", "2026-01-01", "", ""],
      [`${TAG} No Date`, phone(22), "", "", "", "", ""],
    ];
    await expect(
      importArchivedStudents(cashier, { branchId, dryRun: true }, rows),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const preview = await importArchivedStudents(ceo, { branchId, dryRun: true }, rows);
    expect(preview.byHeader).toBe(true);
    expect(preview.imported).toBe(2);
    expect(preview.skipped).toEqual([
      { row: 4, reason: "errors.importDuplicate" },
      { row: 5, reason: "errors.importExists" },
      { row: 6, reason: "errors.importGroupMissing" },
      { row: 7, reason: "leftAt: validation.date" },
    ]);
    expect(await prisma.student.count({ where: { branchId, isArchived: true } })).toBe(0);

    const result = await importArchivedStudents(ceo, { branchId, dryRun: false }, rows);
    expect(result.imported).toBe(2);
    const gone = await prisma.student.findFirstOrThrow({
      where: { branchId, phone: phone(20) },
      include: { memberships: true },
    });
    expect(gone.isArchived).toBe(true);
    expect(gone.memberships).toHaveLength(1);
    expect(gone.memberships[0]).toMatchObject({
      groupId,
      status: "ARCHIVED",
      leaveReason: "moved",
    });
    expect(gone.memberships[0]!.leftAt?.toISOString().slice(0, 10)).toBe("2026-03-15");
    expect((await getStudent(ceo, active.id)).isArchived).toBe(false);

    const churn = await getChurnReport(ceo, { branchId, from: "2026-03-01", to: "2026-03-31" });
    expect(churn.rows.map((r) => r.fullName)).toContain(`${TAG} Gone One`);

    // The same file again adds nobody.
    const again = await importArchivedStudents(ceo, { branchId, dryRun: false }, rows);
    expect(again.imported).toBe(0);
    expect(again.skipped.filter((s) => s.reason === "errors.importArchivedExists")).toHaveLength(3);
  });

  it("keeps payment history rows that change no balance, archived students included", async () => {
    const gone = await prisma.student.findFirstOrThrow({ where: { branchId, phone: phone(20) } });
    const active = await prisma.student.findFirstOrThrow({ where: { branchId, phone: phone(10) } });
    const balanceBefore = (await getStudent(ceo, active.id)).balance;
    const rows = [
      ["Kampus ID", "Full name", "Phone", "Group", "Amount", "Paid at", "Method", "Comment"],
      ["", "", phone(20), `${TAG} Old Group`, "500 000", "2025-10-05", "Naqd", "old"],
      ["", "", phone(20), `${TAG} Old Group`, "500000", "05.10.2025", "Karta", "same again"],
      [active.id, "", "", "", "300000", "2026-01-10", "", ""],
      ["", "Nobody Here", "", "", "100", "2026-01-10", "", ""],
      ["", "", phone(10), "", "0", "2026-01-10", "", ""],
      ["", "", phone(10), "", "1000", "", "", ""],
    ];
    const preview = await importPaymentHistory(cashier, { branchId, dryRun: true }, rows);
    expect(preview.imported).toBe(2);
    expect(preview.skipped).toEqual([
      { row: 3, reason: "errors.importDuplicate" },
      { row: 5, reason: "errors.studentNotFound" },
      { row: 6, reason: "errors.importZero" },
      { row: 7, reason: "paidAt: validation.date" },
    ]);
    expect(await prisma.legacyPayment.count({ where: { branchId } })).toBe(0);

    const result = await importPaymentHistory(cashier, { branchId, dryRun: false }, rows);
    expect(result.imported).toBe(2);
    const goneRows = await listStudentPaymentHistory(ceo, gone.id);
    expect(goneRows).toHaveLength(1);
    expect(goneRows[0]).toMatchObject({
      amount: 500_000,
      paidAt: "2025-10-05",
      method: "Naqd",
      groupName: `${TAG} Old Group`,
    });
    expect((await getStudent(ceo, active.id)).balance).toBe(balanceBefore);

    const again = await importPaymentHistory(cashier, { branchId, dryRun: false }, rows);
    expect(again.imported).toBe(0);
    expect(again.skipped.filter((s) => s.reason === "errors.importPaymentExists")).toHaveLength(3);

    await expect(deleteLegacyPayment(cashier, goneRows[0]!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await deleteLegacyPayment(ceo, goneRows[0]!.id);
    expect(await listStudentPaymentHistory(ceo, gone.id)).toHaveLength(0);
  });
});
