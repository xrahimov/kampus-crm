/**
 * Catalogue imports (A-111) against the real database: rooms, courses, staff,
 * groups and parents from header-mapped rows, with the skip reasons a manager
 * reads after an upload.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  importCourses,
  importGroups,
  importRooms,
  importStaff,
  parseDays,
  parseTime,
  splitList,
  temporaryPassword,
} from "@/server/services/imports/catalog-import.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createStudent } from "@/server/services/students/students.service";
import { importParents } from "@/server/services/students/import.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `cat${RUN}`;
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
let otherBranchId: string;

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
  branchId = (await createBranch(ceo, { name: `${TAG} Main`, isActive: true })).id;
  otherBranchId = (await createBranch(ceo, { name: `${TAG} Shovot`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
});

afterAll(async () => {
  const branches = [branchId, otherBranchId];
  const students = await prisma.student.findMany({
    where: { branchId: { in: branches } },
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId: { in: branches } }, { actorId: ceo.userId }] },
  });
  await prisma.parent.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.room.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.userBranch.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.userRole.deleteMany({ where: { user: { phone: { startsWith: `+99896${RUN}` } } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

describe("helpers", () => {
  it("reads days in three languages and as patterns", () => {
    expect(parseDays("Mon, Wed, Fri")).toEqual({ pattern: "ODD", weekdays: [1, 3, 5] });
    expect(parseDays("Se Pay Sha")).toEqual({ pattern: "EVEN", weekdays: [2, 4, 6] });
    expect(parseDays("пн/ср")).toEqual({ pattern: "CUSTOM", weekdays: [1, 3] });
    expect(parseDays("Du, Chor, Ju, Sha")).toEqual({ pattern: "CUSTOM", weekdays: [1, 3, 5, 6] });
    expect(parseDays("juft kunlar")).toEqual({ pattern: "EVEN", weekdays: [2, 4, 6] });
    expect(parseDays("Odd days (Mon, Wed, Fri)")).toEqual({ pattern: "ODD", weekdays: [1, 3, 5] });
    expect(parseDays("каждый день")).toEqual({
      pattern: "EVERY_DAY",
      weekdays: [1, 2, 3, 4, 5, 6],
    });
    expect(parseDays("someday")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
  it("reads times, lists and makes usable passwords", () => {
    expect(parseTime("9:00")).toBe("09:00");
    expect(parseTime("18.30")).toBe("18:30");
    expect(parseTime("1899-12-30T14:00:00.000Z")).toBe("14:00");
    expect(parseTime("25:00")).toBeNull();
    expect(splitList("Teacher, Cashier; Admin / Marketer")).toEqual([
      "Teacher",
      "Cashier",
      "Admin",
      "Marketer",
    ]);
    const password = temporaryPassword();
    expect(password).toHaveLength(10);
    expect(password).toMatch(/\d/);
    expect(password).toMatch(/[A-Za-z]/);
    expect(temporaryPassword()).not.toBe(password);
  });
});

describe("rooms and courses", () => {
  it("imports rooms by header, defaults the seats and skips what exists", async () => {
    const result = await importRooms(ceo, branchId, [
      ["Xona", "O'rinlar", "Filial"],
      ["101", "12", ""],
      ["Lab", "", ""],
      ["101", "20", ""],
      ["Zal", "8", `${TAG} Shovot`],
      ["Yoq", "8", "Nowhere"],
      ["", "8", ""],
      ["Big", "5000", ""],
    ]);
    expect(result.imported).toBe(3);
    expect(result.skipped).toEqual([
      { row: 4, reason: "errors.importNameExists" },
      { row: 6, reason: "errors.importBranchUnknown" },
      { row: 7, reason: "name: validation.required" },
      { row: 8, reason: "capacity: validation.max" },
    ]);
    const rooms = await prisma.room.findMany({ where: { branchId }, orderBy: { name: "asc" } });
    expect(rooms.map((r) => [r.name, r.capacity])).toEqual([
      ["101", 12],
      ["Lab", 10],
    ]);
    expect(await prisma.room.count({ where: { branchId: otherBranchId, name: "Zal" } })).toBe(1);
    // The same file again adds nothing.
    const again = await importRooms(ceo, branchId, [
      ["Xona", "O'rinlar"],
      ["101", "12"],
    ]);
    expect(again).toEqual({
      imported: 0,
      skipped: [{ row: 2, reason: "errors.importNameExists" }],
    });
  });

  it("imports courses with prices in the old CRM's spelling", async () => {
    const result = await importCourses(ceo, branchId, [
      ["Курс", "Цена", "Месяцев", "Описание"],
      ["Nemis tili A1", "450 000 so'm", "6", "Evenings"],
      ["IELTS", "1,200,000", "", ""],
      ["Nemis tili A1", "450000", "6", ""],
      ["Free club", "", "3", ""],
    ]);
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([
      { row: 4, reason: "errors.importNameExists" },
      { row: 5, reason: "price: validation.invalid" },
    ]);
    const courses = await prisma.course.findMany({ where: { branchId }, orderBy: { name: "asc" } });
    expect(courses.map((c) => [c.name, Number(c.price), c.durationMonths, c.description])).toEqual([
      ["IELTS", 1_200_000, 1, null],
      ["Nemis tili A1", 450_000, 6, "Evenings"],
    ]);
  });
});

describe("staff and groups", () => {
  it("imports staff with roles by label, makes temporary passwords and reports them once", async () => {
    const result = await importStaff(ceo, branchId, [
      ["F.I.O.", "Telefon", "Rollar", "Filiallar", "Jins", "Ishga olingan", "Parol"],
      [`${TAG} Teacher One`, phone(11), "O‘qituvchi", "", "ayol", "01.09.2026", ""],
      [
        `${TAG} Cashier`,
        phone(12),
        "Cashier, Marketer",
        `${TAG} Shovot; ${TAG} Main`,
        "",
        "",
        "Secret!2026",
      ],
      [`${TAG} Nobody`, phone(13), "Astronaut", "", "", "", ""],
      [`${TAG} NoRole`, phone(14), "", "", "", "", ""],
      [`${TAG} Dup`, phone(11), "Teacher", "", "", "", ""],
      [`${TAG} Short`, phone(15), "Teacher", "", "", "", "short"],
    ]);
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([
      { row: 4, reason: "errors.importRoleUnknown" },
      { row: 5, reason: "roles: validation.required" },
      { row: 6, reason: "errors.importDuplicate" },
      { row: 7, reason: "password: validation.passwordMin" },
    ]);
    expect(result.logins).toHaveLength(1);
    expect(result.logins![0]).toMatchObject({ row: 2, label: `${TAG} Teacher One · ${phone(11)}` });
    expect(result.logins![0]!.secret).toHaveLength(10);
    const teacher = await prisma.user.findUniqueOrThrow({
      where: { phone: phone(11) },
      include: { roles: { include: { role: true } }, branches: true },
    });
    expect(teacher.roles.map((r) => r.role.code)).toEqual(["TEACHER"]);
    expect(teacher.branches.map((b) => b.branchId)).toEqual([branchId]);
    expect(teacher.gender).toBe("FEMALE");
    expect(teacher.hireDate?.toISOString().slice(0, 10)).toBe("2026-09-01");
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { phone: phone(12) },
      include: { roles: { include: { role: true } }, branches: true },
    });
    expect(cashier.roles.map((r) => r.role.code).sort()).toEqual(["CASHIER", "MARKETER"]);
    expect(cashier.branches.map((b) => b.branchId).sort()).toEqual(
      [branchId, otherBranchId].sort(),
    );
    // Re-uploading the same people is harmless.
    const again = await importStaff(ceo, branchId, [
      ["Full name", "Phone", "Roles"],
      [`${TAG} Teacher One`, phone(11), "Teacher"],
    ]);
    expect(again.skipped).toEqual([{ row: 2, reason: "errors.importUserExists" }]);
  });

  it("imports groups with course, teacher and room by name and days in words", async () => {
    const result = await importGroups(ceo, branchId, [
      ["Guruh", "Kurs", "O'qituvchi", "Kunlar", "Vaqt", "Xona", "Boshlanish sanasi", "Holat"],
      [
        `${TAG} A1 Evening`,
        "Nemis tili A1",
        `${TAG} Teacher One`,
        "Du, Chor, Ju",
        "18:00-19:30",
        "101",
        "2026-10-01",
        "faol",
      ],
      [`${TAG} IELTS Sat`, "IELTS", phone(11), "Sha", "10:00", "", "01.10.2026", ""],
      [`${TAG} No course`, "Physics", "", "Du", "10:00", "", "", ""],
      [`${TAG} Bad days`, "IELTS", "", "sometimes", "10:00", "", "", ""],
      [`${TAG} Bad room`, "IELTS", "", "Du", "10:00", "Penthouse", "", ""],
      [`${TAG} Bad teacher`, "IELTS", "Someone Else", "Du", "10:00", "", "", ""],
      [`${TAG} A1 Evening`, "Nemis tili A1", "", "Du", "10:00", "", "", ""],
      [`${TAG} No time`, "IELTS", "", "Du", "", "", "", ""],
    ]);
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([
      { row: 4, reason: "errors.importCourseUnknown" },
      { row: 5, reason: "errors.importDaysInvalid" },
      { row: 6, reason: "errors.importRoomUnknown" },
      { row: 7, reason: "errors.importTeacherUnknown" },
      { row: 8, reason: "errors.importNameExists" },
      { row: 9, reason: "startTime: validation.required" },
    ]);
    const evening = await prisma.group.findFirstOrThrow({
      where: { branchId, name: `${TAG} A1 Evening` },
      include: {
        slots: { orderBy: { weekday: "asc" } },
        teachers: true,
        course: true,
        lessons: { select: { id: true } },
      },
    });
    expect(evening.course.name).toBe("Nemis tili A1");
    expect(evening.weekdayPattern).toBe("ODD");
    expect(evening.status).toBe("ACTIVE");
    expect(evening.slots.map((s) => [s.weekday, s.startTime, s.endTime])).toEqual([
      [1, "18:00", "19:30"],
      [3, "18:00", "19:30"],
      [5, "18:00", "19:30"],
    ]);
    expect(evening.slots.every((s) => s.roomId !== null)).toBe(true);
    expect(evening.teachers).toHaveLength(1);
    expect(evening.lessons.length).toBeGreaterThan(0);
    const saturday = await prisma.group.findFirstOrThrow({
      where: { branchId, name: `${TAG} IELTS Sat` },
      include: { slots: true, teachers: { include: { user: true } } },
    });
    expect(saturday.weekdayPattern).toBe("CUSTOM");
    expect(saturday.slots.map((s) => [s.weekday, s.startTime, s.endTime])).toEqual([
      [6, "10:00", "11:30"],
    ]);
    expect(saturday.teachers[0]?.user.phone).toBe(phone(11));
    expect(saturday.startDate.toISOString().slice(0, 10)).toBe("2026-10-01");
  });
});

describe("parents", () => {
  it("attaches parents to students found by id, phone or name", async () => {
    const ali = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Ali`,
      phone: phone(21),
      gender: "MALE",
      birthDate: null,
      note: null,
    });
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Vali`,
      phone: phone(22),
      gender: "MALE",
      birthDate: null,
      note: null,
    });
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Twin`,
      phone: null,
      gender: "MALE",
      birthDate: null,
      note: null,
    });
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Twin`,
      phone: null,
      gender: "FEMALE",
      birthDate: null,
      note: null,
    });
    const result = await importParents(ceo, branchId, [
      ["Kampus ID", "O'quvchi", "Telefon", "Ota-ona", "Ota-ona telefoni"],
      [ali.id, "", "", "Ali's mother", phone(31)],
      ["", "", phone(22), "Vali's father", phone(32)],
      ["", `${TAG} vali`, "", "Vali's mother", phone(33)],
      ["", `${TAG} Twin`, "", "Someone", phone(34)],
      ["", `${TAG} Ghost`, "", "Someone", phone(35)],
      [ali.id, "", "", "Ali's mother again", phone(31)],
      [ali.id, "", "", "", phone(36)],
      [ali.id, "", "", "No phone", ""],
    ]);
    expect(result.imported).toBe(3);
    expect(result.skipped).toEqual([
      { row: 5, reason: "errors.importAmbiguous" },
      { row: 6, reason: "errors.studentNotFound" },
      { row: 7, reason: "errors.importParentExists" },
      { row: 8, reason: "parentName: validation.required" },
      { row: 9, reason: "parentPhone: validation.phone" },
    ]);
    const parents = await prisma.parent.findMany({
      where: { student: { branchId } },
      orderBy: { phone: "asc" },
    });
    expect(parents.map((p) => [p.fullName, p.phone])).toEqual([
      ["Ali's mother", phone(31)],
      ["Vali's father", phone(32)],
      ["Vali's mother", phone(33)],
    ]);
  });
});
