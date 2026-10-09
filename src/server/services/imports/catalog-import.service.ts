import { randomInt } from "node:crypto";

import { z } from "zod";

import { phoneSchema } from "@/lib/validation/common";
import type { GroupInput, Weekday, WeekdayPattern } from "@/lib/validation/groups";
import { GROUP_STATUSES, type GroupStatus } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import {
  labelsOf,
  mapColumns,
  normalizeHeader,
  parseSignedMoney,
  pick,
  type ColumnSpec,
} from "@/server/excel/import-columns";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { createStaff, TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";
import {
  dataRows,
  firstIssue,
  GENDER_WORDS,
  normalizeDate,
  normalizePhone,
  reasonOf,
  type ImportResult,
} from "@/server/services/students/import.service";

/*
 * Catalogue imports (A-111): rooms, courses, staff and groups from a spreadsheet
 * or CSV, so a centre moving to Kampus is loaded in an hour instead of typed in
 * by hand. Same contract as the student imports: one row per record, validated
 * one by one, the result says which rows were skipped and why. Columns are found
 * by header (A-109); the template's order applies when no header is recognised.
 */

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date");

/** "Teacher, Cashier", "Teacher; Admin", "Teacher / Admin" → tokens. */
export function splitList(raw: string): string[] {
  return raw
    .split(/[,;/|\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

const key = (branchId: string, text: string) => `${branchId}|${normalizeHeader(text)}`;

/** The actor's active branches by normalised name. */
async function branchIndex(db: DbClient, actor: Actor): Promise<Map<string, string>> {
  const branches = await db.branch.findMany({
    where: { id: { in: actor.branchIds }, isActive: true },
    select: { id: true, name: true },
  });
  return new Map(branches.map((b) => [normalizeHeader(b.name), b.id]));
}

/** The branch a row goes to: its `branch` column when present, else the dialog's choice. */
function rowBranch(
  branches: Map<string, string>,
  raw: string | null,
  defaultBranchId: string,
): string | null {
  if (!raw) return defaultBranchId;
  return branches.get(normalizeHeader(raw)) ?? null;
}

// --- Rooms --------------------------------------------------------------------

export const ROOM_IMPORT_COLUMNS = ["name", "capacity", "branch"] as const;
const ROOM_IMPORT_SPECS: ColumnSpec[] = [
  { key: "name", aliases: ["room", "xona", "nomi", "комната", "аудитория", "название", "kabinet"] },
  { key: "capacity", aliases: ["seats", "places", "sig'im", "o'rinlar", "вместимость", "мест"] },
  { key: "branch", aliases: ["filial", "филиал"] },
];
const roomRowSchema = z.object({
  name,
  capacity: z.coerce
    .number("validation.invalid")
    .int("validation.invalid")
    .min(1, "validation.min")
    .max(1000, "validation.max"),
});

export async function importRooms(
  actor: Actor,
  defaultBranchId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "settings.catalog");
  authorizeBranch(actor, defaultBranchId);
  const result: ImportResult = { imported: 0, skipped: [] };
  const map = mapColumns(rows[0] ?? [], ROOM_IMPORT_SPECS);
  const branches = await branchIndex(db, actor);
  const existing = new Set(
    (
      await db.room.findMany({
        where: { branchId: { in: actor.branchIds } },
        select: { branchId: true, name: true },
      })
    ).map((r) => key(r.branchId, r.name)),
  );
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });
    const branchId = rowBranch(branches, pick(map, raw, "branch"), defaultBranchId);
    if (!branchId) {
      skip("errors.importBranchUnknown");
      continue;
    }
    const capacityText = pick(map, raw, "capacity");
    const parsed = roomRowSchema.safeParse({
      name: pick(map, raw, "name") ?? "",
      capacity: capacityText ? (parseSignedMoney(capacityText) ?? "x") : 10,
    });
    if (!parsed.success) {
      skip(firstIssue(parsed.error));
      continue;
    }
    if (existing.has(key(branchId, parsed.data.name))) {
      skip("errors.importNameExists");
      continue;
    }
    try {
      await createRoom(actor, { branchId, ...parsed.data }, db);
      existing.add(key(branchId, parsed.data.name));
      result.imported += 1;
    } catch (error) {
      skip(reasonOf(error));
    }
  }
  return result;
}

// --- Courses ------------------------------------------------------------------

export const COURSE_IMPORT_COLUMNS = [
  "name",
  "price",
  "durationMonths",
  "description",
  "branch",
] as const;
const COURSE_IMPORT_SPECS: ColumnSpec[] = [
  { key: "name", aliases: ["course", "kurs", "nomi", "курс", "название"] },
  { key: "price", aliases: ["narx", "oylik narx", "цена", "стоимость", "monthly price", "fee"] },
  {
    key: "durationMonths",
    aliases: ["duration", "months", "davomiyligi", "oylar", "длительность", "месяцев", "срок"],
  },
  { key: "description", aliases: ["tavsif", "izoh", "описание", "note", "comment"] },
  { key: "branch", aliases: ["filial", "филиал"] },
];
const courseRowSchema = z.object({
  name,
  price: z.coerce
    .number("validation.invalid")
    .min(0, "validation.min")
    .max(9_999_999_999_999, "validation.max"),
  durationMonths: z.coerce
    .number("validation.invalid")
    .int("validation.invalid")
    .min(1, "validation.min")
    .max(60, "validation.max"),
  description: z.string().trim().max(500, "validation.tooLong").nullable(),
});

export async function importCourses(
  actor: Actor,
  defaultBranchId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "settings.catalog");
  authorizeBranch(actor, defaultBranchId);
  const result: ImportResult = { imported: 0, skipped: [] };
  const map = mapColumns(rows[0] ?? [], COURSE_IMPORT_SPECS);
  const branches = await branchIndex(db, actor);
  const existing = new Set(
    (
      await db.course.findMany({
        where: { branchId: { in: actor.branchIds }, isArchived: false },
        select: { branchId: true, name: true },
      })
    ).map((c) => key(c.branchId, c.name)),
  );
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });
    const branchId = rowBranch(branches, pick(map, raw, "branch"), defaultBranchId);
    if (!branchId) {
      skip("errors.importBranchUnknown");
      continue;
    }
    const priceText = pick(map, raw, "price");
    const monthsText = pick(map, raw, "durationMonths");
    const parsed = courseRowSchema.safeParse({
      name: pick(map, raw, "name") ?? "",
      price: priceText ? (parseSignedMoney(priceText) ?? "x") : "x",
      durationMonths: monthsText ? (parseSignedMoney(monthsText) ?? "x") : 1,
      description: pick(map, raw, "description"),
    });
    if (!parsed.success) {
      skip(firstIssue(parsed.error));
      continue;
    }
    if (existing.has(key(branchId, parsed.data.name))) {
      skip("errors.importNameExists");
      continue;
    }
    try {
      await createCourse(
        actor,
        {
          branchId,
          ...parsed.data,
          description: parsed.data.description ?? undefined,
          gradingSystemId: null,
          color: null,
        },
        db,
      );
      existing.add(key(branchId, parsed.data.name));
      result.imported += 1;
    } catch (error) {
      skip(reasonOf(error));
    }
  }
  return result;
}

// --- Staff --------------------------------------------------------------------

export const STAFF_IMPORT_COLUMNS = [
  "fullName",
  "phone",
  "roles",
  "branches",
  "gender",
  "birthDate",
  "hireDate",
  "password",
] as const;
const STAFF_IMPORT_SPECS: ColumnSpec[] = [
  {
    key: "fullName",
    aliases: ["name", "ism", "fio", "f.i.o.", "имя", "фио", "сотрудник", "xodim"],
  },
  { key: "phone", aliases: ["tel", "telefon", "телефон", "mobile"] },
  { key: "roles", aliases: ["role", "rol", "rollar", "lavozim", "роль", "роли", "должность"] },
  { key: "branches", aliases: ["branch", "filial", "filiallar", "филиал", "филиалы"] },
  { key: "gender", aliases: ["sex", "jins", "jinsi", "пол"] },
  { key: "birthDate", aliases: ["birthday", "dob", "tug'ilgan sana", "дата рождения"] },
  {
    key: "hireDate",
    aliases: ["hired", "hired on", "ishga olingan", "дата приёма", "дата приема"],
  },
  { key: "password", aliases: ["parol", "пароль"] },
];
const staffRowSchema = z.object({
  fullName: name,
  phone: phoneSchema,
  gender: z.enum(["MALE", "FEMALE"]).nullable(),
  birthDate: date.nullable(),
  hireDate: date.nullable(),
  password: z
    .string()
    .min(8, "validation.passwordMin")
    .max(128, "validation.passwordMax")
    .nullable(),
});

/** A first password nobody has to think up: 10 characters, letters and digits, no look-alikes. */
export function temporaryPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pickFrom = (s: string) => s[randomInt(s.length)]!;
  const chars = Array.from({ length: 7 }, () => pickFrom(letters)).concat(
    Array.from({ length: 3 }, () => pickFrom(digits)),
  );
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Role codes by code, by the role's own name and by its label in every UI language. */
async function roleIndex(db: DbClient, actor: Actor): Promise<Map<string, string>> {
  const roles = await db.role.findMany({
    where: {
      isActive: true,
      OR: [{ organizationId: null }, { organizationId: actor.organizationId }],
    },
    select: { code: true, name: true },
  });
  const index = new Map<string, string>();
  for (const role of roles) {
    index.set(normalizeHeader(role.code), role.code);
    index.set(normalizeHeader(role.name), role.code);
    for (const labels of labelsOf("roles")) {
      const label = labels[role.code];
      if (label) index.set(normalizeHeader(label), role.code);
    }
  }
  return index;
}

export async function importStaff(
  actor: Actor,
  defaultBranchId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "staff.create");
  authorizeBranch(actor, defaultBranchId);
  const result: ImportResult = { imported: 0, skipped: [], logins: [] };
  const map = mapColumns(rows[0] ?? [], STAFF_IMPORT_SPECS);
  const [roles, branches] = await Promise.all([roleIndex(db, actor), branchIndex(db, actor)]);
  const seen = new Set<string>();
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });
    const get = (k: (typeof STAFF_IMPORT_COLUMNS)[number]) => pick(map, raw, k);
    const genderWord = get("gender")?.toLowerCase() ?? "";
    const parsed = staffRowSchema.safeParse({
      fullName: get("fullName") ?? "",
      phone: get("phone") ? normalizePhone(get("phone")!) : "",
      gender: genderWord ? (GENDER_WORDS[genderWord] ?? "invalid") : null,
      birthDate: normalizeDate(get("birthDate") ?? ""),
      hireDate: normalizeDate(get("hireDate") ?? ""),
      password: get("password"),
    });
    if (!parsed.success) {
      skip(firstIssue(parsed.error));
      continue;
    }
    const s = parsed.data;
    if (seen.has(s.phone)) {
      skip("errors.importDuplicate");
      continue;
    }
    seen.add(s.phone);
    if (await db.user.findFirst({ where: { phone: s.phone }, select: { id: true } })) {
      skip("errors.importUserExists");
      continue;
    }
    const roleCodes = splitList(get("roles") ?? "").map((token) =>
      roles.get(normalizeHeader(token)),
    );
    if (roleCodes.some((code) => code === undefined)) {
      skip("errors.importRoleUnknown");
      continue;
    }
    if (roleCodes.length === 0) {
      skip("roles: validation.required");
      continue;
    }
    const branchIds = splitList(get("branches") ?? "").map((token) =>
      branches.get(normalizeHeader(token)),
    );
    if (branchIds.some((id) => id === undefined)) {
      skip("errors.importBranchUnknown");
      continue;
    }
    const password = s.password ?? temporaryPassword();
    try {
      await createStaff(
        actor,
        "staff",
        {
          fullName: s.fullName,
          phone: s.phone,
          gender: s.gender ?? "MALE",
          birthDate: s.birthDate,
          hireDate: s.hireDate,
          photoUrl: null,
          roleCodes: [...new Set(roleCodes as string[])],
          branchIds: branchIds.length > 0 ? [...new Set(branchIds as string[])] : [defaultBranchId],
          password,
        },
        db,
      );
      result.imported += 1;
      if (!s.password) {
        result.logins!.push({ row: line, label: `${s.fullName} · ${s.phone}`, secret: password });
      }
    } catch (error) {
      skip(reasonOf(error));
    }
  }
  return result;
}

// --- Groups -------------------------------------------------------------------

export const GROUP_IMPORT_COLUMNS = [
  "name",
  "course",
  "teacher",
  "weekdays",
  "startTime",
  "endTime",
  "room",
  "startDate",
  "endDate",
  "status",
  "branch",
] as const;
const GROUP_IMPORT_SPECS: ColumnSpec[] = [
  { key: "name", aliases: ["group", "guruh", "nomi", "группа", "название"] },
  { key: "course", aliases: ["kurs", "курс", "fan", "предмет"] },
  {
    key: "teacher",
    aliases: ["o'qituvchi", "ustoz", "учитель", "преподаватель", "teacher phone", "teacher name"],
  },
  {
    key: "weekdays",
    aliases: ["days", "kunlar", "hafta kunlari", "дни", "дни недели", "pattern", "schedule"],
  },
  { key: "startTime", aliases: ["time", "start", "vaqt", "boshlanish vaqti", "время", "начало"] },
  { key: "endTime", aliases: ["end", "tugash vaqti", "окончание", "конец"] },
  { key: "room", aliases: ["xona", "kabinet", "комната", "аудитория"] },
  { key: "startDate", aliases: ["start date", "from", "boshlanish sanasi", "дата начала"] },
  { key: "endDate", aliases: ["end date", "to", "tugash sanasi", "дата окончания"] },
  { key: "status", aliases: ["holat", "holati", "статус"] },
  { key: "branch", aliases: ["filial", "филиал"] },
];

const PATTERN_DAYS: Record<Exclude<WeekdayPattern, "CUSTOM">, Weekday[]> = {
  EVEN: [2, 4, 6],
  ODD: [1, 3, 5],
  EVERY_DAY: [1, 2, 3, 4, 5, 6],
};
const WEEKDAY_WORDS: Record<string, Weekday> = {
  "1": 1,
  mon: 1,
  monday: 1,
  du: 1,
  dush: 1,
  dushanba: 1,
  пн: 1,
  пон: 1,
  понедельник: 1,
  "2": 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  se: 2,
  sesh: 2,
  seshanba: 2,
  вт: 2,
  вторник: 2,
  "3": 3,
  wed: 3,
  wednesday: 3,
  chor: 3,
  chorshanba: 3,
  ср: 3,
  среда: 3,
  "4": 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  pay: 4,
  paysh: 4,
  payshanba: 4,
  чт: 4,
  четверг: 4,
  "5": 5,
  fri: 5,
  friday: 5,
  ju: 5,
  juma: 5,
  пт: 5,
  пятница: 5,
  "6": 6,
  sat: 6,
  saturday: 6,
  sha: 6,
  shan: 6,
  shanba: 6,
  сб: 6,
  суббота: 6,
  "7": 7,
  sun: 7,
  sunday: 7,
  yak: 7,
  yaksh: 7,
  yakshanba: 7,
  вс: 7,
  воскресенье: 7,
};

/**
 * "Mon, Wed, Fri", "Du Chor Ju", "пн/ср/пт", "odd", "juft", "каждый день" → the
 * pattern Kampus keeps and the weekdays of its lessons (A-50).
 */
export function parseDays(text: string): { pattern: WeekdayPattern; weekdays: Weekday[] } | null {
  const compact = normalizeHeader(text);
  if (!compact) return null;
  const fixed: WeekdayPattern | null = /^(even|juft|ч[её]тн)/.test(compact)
    ? "EVEN"
    : /^(odd|toq|неч[её]тн)/.test(compact)
      ? "ODD"
      : /^(every|daily|harkuni|кажд|ежедн)/.test(compact)
        ? "EVERY_DAY"
        : null;
  if (fixed) return { pattern: fixed, weekdays: PATTERN_DAYS[fixed] };
  const days = new Set<Weekday>();
  for (const token of text
    .toLowerCase()
    .split(/[\s,;/|.+&-]+/)
    .filter(Boolean)) {
    const day = WEEKDAY_WORDS[token.replace(/['ʼ’`]/g, "")];
    if (!day) return null;
    days.add(day);
  }
  if (days.size === 0) return null;
  const weekdays = [...days].sort((a, b) => a - b);
  const joined = weekdays.join(",");
  const pattern: WeekdayPattern =
    joined === "1,3,5"
      ? "ODD"
      : joined === "2,4,6"
        ? "EVEN"
        : joined === "1,2,3,4,5,6"
          ? "EVERY_DAY"
          : "CUSTOM";
  return { pattern, weekdays };
}

/** "18:00", "18.00", "9:00", an Excel time cell ("1899-12-30T18:00:00.000Z") → "18:00". */
export function parseTime(raw: string): string | null {
  const iso = /T(\d{2}):(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  if (hours > 23 || Number(m[2]) > 59) return null;
  return `${String(hours).padStart(2, "0")}:${m[2]}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const STATUS_WORDS: Record<string, GroupStatus> = {
  active: "ACTIVE",
  faol: "ACTIVE",
  активна: "ACTIVE",
  активная: "ACTIVE",
  активный: "ACTIVE",
  frozen: "FROZEN",
  muzlatilgan: "FROZEN",
  заморожена: "FROZEN",
  замороженная: "FROZEN",
  trial: "TRIAL",
  sinov: "TRIAL",
  пробная: "TRIAL",
  пробный: "TRIAL",
  archived: "ARCHIVED",
  arxiv: "ARCHIVED",
  arxivlangan: "ARCHIVED",
  архив: "ARCHIVED",
  архивная: "ARCHIVED",
};

type TeacherRow = {
  id: string;
  salaryMethod: string | null;
  percentShare: unknown;
  perLessonFee: unknown;
  perStudentFee: unknown;
};

/** The teacher's share in a group from how they are paid (EXP §4), else a zero percent. */
function teacherShare(t: TeacherRow): GroupInput["teachers"][number] {
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  if (t.salaryMethod === "PER_LESSON") {
    return { userId: t.id, role: "MAIN", shareType: "PER_LESSON", shareValue: num(t.perLessonFee) };
  }
  if (t.salaryMethod === "PER_STUDENT") {
    return {
      userId: t.id,
      role: "MAIN",
      shareType: "PER_STUDENT",
      shareValue: num(t.perStudentFee),
    };
  }
  return {
    userId: t.id,
    role: "MAIN",
    shareType: "PERCENT",
    shareValue: t.salaryMethod === "PERCENT" ? num(t.percentShare) : 0,
  };
}

export async function importGroups(
  actor: Actor,
  defaultBranchId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "groups.create");
  authorizeBranch(actor, defaultBranchId);
  const result: ImportResult = { imported: 0, skipped: [] };
  const map = mapColumns(rows[0] ?? [], GROUP_IMPORT_SPECS);
  const today = new Date().toISOString().slice(0, 10);
  const branches = await branchIndex(db, actor);
  const [courses, rooms, groups, teachers] = await Promise.all([
    db.course.findMany({
      where: { branchId: { in: actor.branchIds }, isArchived: false },
      select: { id: true, branchId: true, name: true },
    }),
    db.room.findMany({
      where: { branchId: { in: actor.branchIds } },
      select: { id: true, branchId: true, name: true },
    }),
    db.group.findMany({
      where: { branchId: { in: actor.branchIds }, status: { not: "ARCHIVED" } },
      select: { branchId: true, name: true },
    }),
    db.user.findMany({
      where: {
        organizationId: actor.organizationId,
        isArchived: false,
        roles: { some: { role: { code: { in: TEACHER_ROLE_CODES } } } },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        salaryMethod: true,
        percentShare: true,
        perLessonFee: true,
        perStudentFee: true,
      },
    }),
  ]);
  const courseIndex = new Map(courses.map((c) => [key(c.branchId, c.name), c.id]));
  const roomIndex = new Map(rooms.map((r) => [key(r.branchId, r.name), r.id]));
  const existing = new Set(groups.map((g) => key(g.branchId, g.name)));
  const byPhone = new Map(teachers.map((t) => [t.phone, t]));
  const byName = new Map<string, TeacherRow | "ambiguous">();
  for (const t of teachers) {
    const k = normalizeHeader(t.fullName);
    byName.set(k, byName.has(k) ? "ambiguous" : t);
  }

  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });
    const get = (k: (typeof GROUP_IMPORT_COLUMNS)[number]) => pick(map, raw, k);
    const branchId = rowBranch(branches, get("branch"), defaultBranchId);
    if (!branchId) {
      skip("errors.importBranchUnknown");
      continue;
    }
    const groupName = name.safeParse(get("name") ?? "");
    if (!groupName.success) {
      skip(`name: ${groupName.error.issues[0]?.message ?? "validation.invalid"}`);
      continue;
    }
    if (existing.has(key(branchId, groupName.data))) {
      skip("errors.importNameExists");
      continue;
    }
    const courseId = get("course") ? courseIndex.get(key(branchId, get("course")!)) : undefined;
    if (!courseId) {
      skip(get("course") ? "errors.importCourseUnknown" : "course: validation.required");
      continue;
    }
    const days = parseDays(get("weekdays") ?? "");
    if (!days) {
      skip(get("weekdays") ? "errors.importDaysInvalid" : "weekdays: validation.required");
      continue;
    }
    // "18:00-19:30" in one cell is a common export shape.
    let startText = get("startTime") ?? "";
    let endText = get("endTime") ?? "";
    const range = /^(.+?)\s*[-–—]\s*(.+)$/.exec(startText);
    if (range && !endText) {
      startText = range[1]!;
      endText = range[2]!;
    }
    const startTime = parseTime(startText);
    if (!startTime) {
      skip(startText ? "errors.importTimeInvalid" : "startTime: validation.required");
      continue;
    }
    const endTime = endText ? parseTime(endText) : addMinutes(startTime, 90);
    if (!endTime || endTime <= startTime) {
      skip("errors.importTimeInvalid");
      continue;
    }
    let roomId: string | null = null;
    if (get("room")) {
      roomId = roomIndex.get(key(branchId, get("room")!)) ?? null;
      if (!roomId) {
        skip("errors.importRoomUnknown");
        continue;
      }
    }
    let teacher: TeacherRow | null = null;
    const teacherText = get("teacher");
    if (teacherText) {
      const phone = normalizePhone(teacherText);
      const found = (phone && byPhone.get(phone)) || byName.get(normalizeHeader(teacherText));
      if (found === "ambiguous") {
        skip("errors.importAmbiguous");
        continue;
      }
      if (!found) {
        skip("errors.importTeacherUnknown");
        continue;
      }
      teacher = found;
    }
    const startDate = normalizeDate(get("startDate") ?? "") ?? today;
    const endDate = normalizeDate(get("endDate") ?? "");
    if (!date.safeParse(startDate).success || (endDate && !date.safeParse(endDate).success)) {
      skip("startDate: validation.date");
      continue;
    }
    const statusText = get("status");
    const status = statusText
      ? (STATUS_WORDS[statusText.toLowerCase()] ??
        GROUP_STATUSES.find((s) => s === statusText.toUpperCase()))
      : "ACTIVE";
    if (!status) {
      skip("status: validation.invalid");
      continue;
    }
    try {
      await createGroup(
        actor,
        {
          branchId,
          name: groupName.data,
          courseId,
          gradingSystemId: null,
          weekdayPattern: days.pattern,
          slots: days.weekdays.map((weekday) => ({ weekday, startTime, endTime, roomId })),
          teachers: teacher ? [teacherShare(teacher)] : [],
          startDate,
          endDate,
          status,
          // An imported timetable is the centre's existing reality (A-116).
          ignoreClashes: true,
        },
        db,
      );
      existing.add(key(branchId, groupName.data));
      result.imported += 1;
    } catch (error) {
      skip(reasonOf(error));
    }
  }
  return result;
}
