import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { normalizeHeader, parseSignedMoney } from "@/server/excel/import-columns";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import { dateToIso } from "@/server/services/settings/shared";
import { importOpeningBalances } from "@/server/services/students/adjustments.service";
import { importPaymentHistory } from "@/server/services/students/history-import.service";
import {
  dataRows,
  importMembers,
  importStudents,
  normalizeDate,
  normalizePhone,
  type ImportResult,
} from "@/server/services/students/import.service";

import { importGroups, importStaff, parseTime } from "./catalog-import.service";

/*
 * SOFF CRM importer (A-143). Most Uzbek centres run that vendor's CRM, and each of
 * its lists has an EXCEL button. This module recognises those exports by their
 * Uzbek headers (staff, groups, students, student payments), shows which columns
 * it understood, previews, and then feeds the rows to the Kampus importers that
 * already exist (A-109, A-110, A-111, A-142), so one upload per file is the whole
 * migration. Columns are matched by header, never by position: a column the
 * vendor adds or moves changes nothing.
 */

export const SOFF_KINDS = ["staff", "groups", "students", "payments"] as const;
export type SoffKind = (typeof SOFF_KINDS)[number];

interface SoffColumn {
  key: string;
  /** Header spellings seen on the vendor's screens, plus English and Russian variants. */
  aliases: readonly string[];
}

interface SoffFile {
  /** Keys that must all be present for a file to count as this kind. */
  required: readonly string[];
  /** At least one of these must be present too, to tell the kinds apart. */
  any: readonly string[];
  columns: readonly SoffColumn[];
}

const NAME = ["ism familiya", "ism", "f.i.o", "fio", "full name", "name", "фио", "имя"];
const PHONE = ["telefon raqam", "telefon", "tel", "phone", "телефон"];
const NOTE = ["izoh", "comment", "note", "комментарий", "примечание"];

const FILES: Record<SoffKind, SoffFile> = {
  staff: {
    required: ["fullName"],
    any: ["roles", "fixedSalary", "percent", "hireDate"],
    columns: [
      { key: "fullName", aliases: NAME },
      { key: "phone", aliases: PHONE },
      {
        key: "roles",
        aliases: [
          "kasbi",
          "kasb",
          "rollar",
          "rol",
          "lavozim",
          "roles",
          "role",
          "должность",
          "роль",
        ],
      },
      { key: "fixedSalary", aliases: ["doimiy oylik", "oylik", "fixed salary", "salary", "оклад"] },
      { key: "percent", aliases: ["foiz ulush", "foiz ulush (%)", "foiz", "percent", "процент"] },
      { key: "lessonFee", aliases: ["dars haqi", "per lesson", "за урок"] },
      {
        key: "birthDate",
        aliases: ["tug'ilgan sana", "tugilgan sana", "birth date", "дата рождения"],
      },
      {
        key: "hireDate",
        aliases: ["ishga olingan sana", "hire date", "дата приёма", "дата приема"],
      },
      { key: "branch", aliases: ["filial", "branch", "филиал"] },
    ],
  },
  groups: {
    required: ["name"],
    any: ["course", "days", "time", "teacher"],
    columns: [
      {
        key: "name",
        aliases: ["guruh nomi", "guruh", "group name", "group", "группа", "название группы"],
      },
      { key: "course", aliases: ["kurs", "course", "курс"] },
      {
        key: "teacher",
        aliases: ["o'qituvchi", "oqituvchi", "ustoz", "teacher", "учитель", "преподаватель"],
      },
      { key: "support", aliases: ["support ustoz", "support teacher", "support"] },
      { key: "days", aliases: ["dars kunlari", "kunlar", "days", "дни занятий", "дни"] },
      { key: "time", aliases: ["dars vaqti", "vaqt", "time", "время занятий", "время"] },
      { key: "startTime", aliases: ["boshlanish vaqti", "start time", "начало"] },
      { key: "endTime", aliases: ["tugash vaqti", "end time", "окончание"] },
      { key: "room", aliases: ["xona", "room", "комната", "аудитория"] },
      {
        key: "studentCount",
        aliases: ["o'quvchilar soni", "oquvchilar soni", "students", "учеников"],
      },
      {
        key: "startDate",
        aliases: [
          "ochilgan",
          "ochilgan sana",
          "boshlanish sanasi",
          "opened",
          "start date",
          "открыта",
          "дата начала",
        ],
      },
      {
        key: "endDate",
        aliases: [
          "yakunlanadi",
          "tugash sanasi",
          "ends",
          "end date",
          "завершается",
          "дата окончания",
        ],
      },
      { key: "status", aliases: ["status", "holat", "holati", "статус"] },
      { key: "branch", aliases: ["filial", "branch", "филиал"] },
    ],
  },
  students: {
    required: ["fullName"],
    any: ["balance", "groups", "nextPayment", "grade", "phone"],
    columns: [
      { key: "id", aliases: ["id", "№", "#"] },
      { key: "fullName", aliases: NAME },
      { key: "phone", aliases: PHONE },
      {
        key: "parentPhone",
        aliases: ["ota-ona telefon", "ota-onasi", "parent phone", "телефон родителя"],
      },
      { key: "gender", aliases: ["jinsi", "jins", "gender", "пол"] },
      {
        key: "birthDate",
        aliases: ["tug'ilgan sana", "tugilgan sana", "birth date", "дата рождения"],
      },
      { key: "note", aliases: NOTE },
      { key: "groups", aliases: ["guruhlar", "guruh", "groups", "group", "группы", "группа"] },
      { key: "balance", aliases: ["balans", "balance", "qoldiq", "баланс", "остаток"] },
      {
        key: "nextPayment",
        aliases: ["keyingi to'lov", "keyingi tolov", "next payment", "следующая оплата"],
      },
      { key: "grade", aliases: ["baho", "grade", "оценка"] },
      { key: "status", aliases: ["holat", "holati", "status", "статус"] },
      {
        key: "joinedAt",
        aliases: ["qo'shilgan sana", "qoshilgan sana", "joined", "дата добавления"],
      },
      { key: "branch", aliases: ["filial", "branch", "филиал"] },
    ],
  },
  payments: {
    required: ["amount"],
    any: ["date", "method", "forMonth", "receivedBy", "student"],
    columns: [
      { key: "id", aliases: ["id", "№", "#"] },
      {
        key: "student",
        aliases: ["o'quvchi", "oquvchi", "talaba", "student", "ученик", "студент", ...NAME],
      },
      { key: "phone", aliases: PHONE },
      {
        key: "date",
        aliases: ["sana", "to'lov sanasi", "tolov sanasi", "date", "дата", "дата оплаты"],
      },
      { key: "forMonth", aliases: ["qaysi oy uchun", "oy", "for month", "за месяц", "месяц"] },
      { key: "type", aliases: ["turi", "type", "тип"] },
      { key: "amount", aliases: ["summa", "amount", "сумма", "to'lov", "tolov", "оплата"] },
      {
        key: "refunded",
        aliases: ["qaytarilgan summa", "qaytarilgan", "refunded", "возвращено", "возврат"],
      },
      { key: "bonus", aliases: ["bonus", "бонус"] },
      { key: "group", aliases: ["guruh", "group", "группа"] },
      { key: "comment", aliases: NOTE },
      { key: "createdAt", aliases: ["yaratilgan vaqt", "yaratilgan", "created at", "создано"] },
      {
        key: "method",
        aliases: [
          "to'lov turi",
          "tolov turi",
          "to'lov usuli",
          "tolov usuli",
          "payment method",
          "method",
          "способ оплаты",
          "способ",
        ],
      },
      { key: "receivedBy", aliases: ["qabul qildi", "kassir", "received by", "принял", "кассир"] },
    ],
  },
};

export interface SoffDetection {
  kind: SoffKind | null;
  /** Kampus field → the header text of the file's column that feeds it. */
  columns: Record<string, string>;
  /** Headers of the file nobody uses. */
  unknown: string[];
  /** Data rows (the header excluded). */
  rows: number;
  /** The first rows, as "field: value" maps, for the person to check the mapping. */
  sample: Array<Record<string, string>>;
}

function mapHeader(header: string[], file: SoffFile): Record<string, number> {
  const labels = new Map<string, string>();
  for (const c of file.columns) {
    labels.set(normalizeHeader(c.key), c.key);
    for (const alias of c.aliases) labels.set(normalizeHeader(alias), c.key);
  }
  const index: Record<string, number> = {};
  header.forEach((text, i) => {
    const key = labels.get(normalizeHeader(text));
    if (key && !(key in index)) index[key] = i;
  });
  return index;
}

function fits(index: Record<string, number>, file: SoffFile): boolean {
  return file.required.every((k) => k in index) && file.any.some((k) => k in index);
}

/** Which of the vendor's exports this sheet is, judged by its header row. */
export function detectSoffFile(rows: string[][], hint?: SoffKind): SoffDetection {
  const header = (rows[0] ?? []).map((h) => h.trim());
  let best: { kind: SoffKind; index: Record<string, number> } | null = null;
  const order: SoffKind[] = hint
    ? [hint, ...SOFF_KINDS.filter((k) => k !== hint)]
    : [...SOFF_KINDS];
  for (const kind of order) {
    const index = mapHeader(header, FILES[kind]);
    if (!fits(index, FILES[kind])) continue;
    const score = Object.keys(index).length + (kind === hint ? 100 : 0);
    if (!best || score > Object.keys(best.index).length) best = { kind, index };
  }
  const data = dataRows(rows);
  if (!best)
    return {
      kind: null,
      columns: {},
      unknown: header.filter(Boolean),
      rows: data.length,
      sample: [],
    };
  const used = new Set(Object.values(best.index));
  const columns: Record<string, string> = {};
  for (const [key, i] of Object.entries(best.index)) columns[key] = header[i] ?? "";
  const sample = data.slice(0, 3).map((row) => {
    const out: Record<string, string> = {};
    for (const [key, i] of Object.entries(best!.index)) {
      const v = (row[i] ?? "").trim();
      if (v) out[key] = v;
    }
    return out;
  });
  return {
    kind: best.kind,
    columns,
    unknown: header.filter((h, i) => h && !used.has(i)),
    rows: data.length,
    sample,
  };
}

export interface SoffRunResult extends ImportResult {
  kind: SoffKind;
  dryRun: boolean;
  matched: Array<{ row: number; label: string }>;
  /** Side imports a students file also runs: group memberships and opening balances. */
  extra: Array<{ key: "members" | "balances"; imported: number; skipped: number }>;
}

type Reader = (row: string[], key: string) => string | null;

function readerFor(rows: string[][], kind: SoffKind): Reader {
  const index = mapHeader(
    (rows[0] ?? []).map((h) => h.trim()),
    FILES[kind],
  );
  return (row, key) => {
    const i = index[key];
    if (i === undefined) return null;
    return (row[i] ?? "").trim() || null;
  };
}

/** "09:00 - 10:30", "09:00-10:30", "9.00 – 10.30" → ["09:00", "10:30"]. */
export function splitTimeRange(text: string): [string | null, string | null] {
  const parts = text.split(/\s*[-–—]\s*/).filter(Boolean);
  const start = parts[0] ? parseTime(parts[0]) : null;
  const end = parts[1] ? parseTime(parts[1]) : null;
  return [start, end];
}

/**
 * The vendor prints a student's groups as "HH:MM - HH:MM – <group> – <teacher>",
 * one per line. Each line is matched against the branch's group names; the
 * longest name contained in the line wins.
 */
export function groupNamesIn(text: string, names: readonly string[]): string[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  for (const line of text.split(/[\n;|]+/)) {
    const hay = line.toLowerCase();
    if (!hay.trim()) continue;
    const hit = sorted.find((n) => n.trim() && hay.includes(n.toLowerCase()));
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** First day of the current month: existing members start being charged now (A-110). */
function firstOfMonth(): string {
  return `${dateToIso(new Date()).slice(0, 7)}-01`;
}

/**
 * Settings → Import from SOFF CRM → Import: feeds one export to the Kampus
 * importers. `dryRun` converts and checks every row and writes nothing. The
 * permission is the one the matching Kampus importer asks for.
 */
export async function runSoffImport(
  actor: Actor,
  options: { kind: SoffKind; branchId: string; dryRun: boolean },
  rows: string[][],
  db: DbClient = prisma,
): Promise<SoffRunResult> {
  const { kind, branchId, dryRun } = options;
  const detection = detectSoffFile(rows, kind);
  if (detection.kind !== kind) throw AppError.validation({ file: ["errors.soffKindMismatch"] });
  authorizeBranch(actor, branchId);
  const read = readerFor(rows, kind);
  const result: SoffRunResult = { kind, dryRun, imported: 0, skipped: [], matched: [], extra: [] };
  const data = dataRows(rows);

  switch (kind) {
    case "staff": {
      authorize(actor, "staff.create");
      const out: string[][] = [["fullName", "phone", "roles", "branches", "birthDate", "hireDate"]];
      const lines: number[] = [];
      data.forEach((row, i) => {
        const line = i + 2;
        const fullName = read(row, "fullName");
        const phone = read(row, "phone");
        if (!fullName)
          return void result.skipped.push({ row: line, reason: "fullName: validation.required" });
        if (!phone || !normalizePhone(phone)) {
          return void result.skipped.push({ row: line, reason: "phone: validation.phone" });
        }
        result.matched.push({
          row: line,
          label: `${fullName} · ${read(row, "roles") ?? ""}`.trim(),
        });
        out.push([
          fullName,
          phone,
          read(row, "roles") ?? "",
          read(row, "branch") ?? "",
          normalizeDate(read(row, "birthDate") ?? "") ?? "",
          normalizeDate(read(row, "hireDate") ?? "") ?? "",
        ]);
      });
      if (dryRun) {
        result.imported = out.length - 1;
        return result;
      }
      const r = await importStaff(actor, branchId, out, db);
      merge(result, r, lines);
      result.logins = r.logins;
      return result;
    }
    case "groups": {
      authorize(actor, "groups.create");
      const out: string[][] = [
        [
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
        ],
      ];
      const lines: number[] = [];
      data.forEach((row, i) => {
        const line = i + 2;
        const name = read(row, "name");
        if (!name)
          return void result.skipped.push({ row: line, reason: "name: validation.required" });
        const [rangeStart, rangeEnd] = splitTimeRange(read(row, "time") ?? "");
        const startTime = read(row, "startTime") ?? rangeStart;
        const endTime = read(row, "endTime") ?? rangeEnd;
        result.matched.push({ row: line, label: `${name} · ${read(row, "course") ?? ""}`.trim() });
        lines.push(line);
        out.push([
          name,
          read(row, "course") ?? "",
          read(row, "teacher") ?? "",
          read(row, "days") ?? "",
          startTime ?? "",
          endTime ?? "",
          read(row, "room") ?? "",
          normalizeDate(read(row, "startDate") ?? "") ?? "",
          normalizeDate(read(row, "endDate") ?? "") ?? "",
          read(row, "status") ?? "",
          read(row, "branch") ?? "",
        ]);
      });
      if (dryRun) {
        result.imported = out.length - 1;
        return result;
      }
      merge(result, await importGroups(actor, branchId, out, db), lines);
      return result;
    }
    case "students": {
      authorize(actor, "students.create");
      const groups = await db.group.findMany({
        where: { branchId, status: { not: "ARCHIVED" } },
        select: { id: true, name: true },
      });
      const groupByName = new Map(groups.map((g) => [g.name, g.id]));
      const names = groups.map((g) => g.name);
      const studentRows: string[][] = [["fullName", "phone", "gender", "birthDate", "note"]];
      const members = new Map<string, string[][]>(); // groupId → [fullName, phone, joinedAt]
      const balances: string[][] = [
        ["studentId", "fullName", "phone", "group", "balance", "date", "comment"],
      ];
      const joinedAt = firstOfMonth();
      const seen = new Set<string>();
      const lines: number[] = [];
      for (const [i, row] of data.entries()) {
        const line = i + 2;
        const fullName = read(row, "fullName");
        if (!fullName || fullName.length < 2) {
          result.skipped.push({ row: line, reason: "fullName: validation.required" });
          continue;
        }
        const rawPhone = read(row, "phone");
        const phone = rawPhone ? normalizePhone(rawPhone) : null;
        if (rawPhone && !phone) {
          result.skipped.push({ row: line, reason: "phone: validation.phone" });
          continue;
        }
        const key = phone ?? fullName.toLowerCase();
        if (seen.has(key)) {
          result.skipped.push({ row: line, reason: "errors.importDuplicate" });
          continue;
        }
        seen.add(key);
        if (phone) {
          const existing = await db.student.count({
            where: { branchId, phone, isArchived: false },
          });
          if (existing > 0) {
            result.skipped.push({ row: line, reason: "errors.importExists" });
            continue;
          }
        }
        const groupNames = groupNamesIn(read(row, "groups") ?? "", names);
        const balance = parseSignedMoney(read(row, "balance") ?? "");
        result.matched.push({
          row: line,
          label: `${fullName}${groupNames.length ? ` · ${groupNames.join(", ")}` : ""}${
            balance ? ` · ${balance}` : ""
          }`,
        });
        lines.push(line);
        studentRows.push([
          fullName,
          phone ?? "",
          read(row, "gender") ?? "",
          normalizeDate(read(row, "birthDate") ?? "") ?? "",
          read(row, "note") ?? "",
        ]);
        for (const g of groupNames) {
          const list = members.get(groupByName.get(g)!) ?? [["fullName", "phone", "joinedAt"]];
          list.push([fullName, phone ?? "", joinedAt]);
          members.set(groupByName.get(g)!, list);
        }
        if (balance && groupNames.length > 0) {
          balances.push([
            "",
            fullName,
            phone ?? "",
            groupNames[0]!,
            String(balance),
            joinedAt,
            "SOFF CRM",
          ]);
        }
      }
      const memberRows = [...members.values()].reduce((n, list) => n + list.length - 1, 0);
      if (dryRun) {
        result.imported = studentRows.length - 1;
        result.extra.push({ key: "members", imported: memberRows, skipped: 0 });
        result.extra.push({ key: "balances", imported: balances.length - 1, skipped: 0 });
        return result;
      }
      merge(result, await importStudents(actor, branchId, studentRows, db), lines);
      let added = 0;
      let skipped = 0;
      for (const [groupId, list] of members) {
        const r = await importMembers(actor, groupId, list, db);
        added += r.imported;
        skipped += r.skipped.length;
      }
      result.extra.push({ key: "members", imported: added, skipped });
      if (balances.length > 1) {
        const r = await importOpeningBalances(actor, { branchId, dryRun: false }, balances, db);
        result.extra.push({ key: "balances", imported: r.imported, skipped: r.skipped.length });
      }
      return result;
    }
    case "payments": {
      authorize(actor, "payments.create");
      const out: string[][] = [
        ["studentId", "fullName", "phone", "group", "amount", "paidAt", "method", "comment"],
      ];
      const lines: number[] = [];
      data.forEach((row, i) => {
        const line = i + 2;
        const amount = parseSignedMoney(read(row, "amount") ?? "");
        const paidAt = normalizeDate(read(row, "date") ?? "");
        const student = read(row, "student");
        const phone = read(row, "phone");
        if (amount === null)
          return void result.skipped.push({ row: line, reason: "amount: validation.required" });
        if (!paidAt || !DATE.test(paidAt)) {
          return void result.skipped.push({ row: line, reason: "paidAt: validation.date" });
        }
        if (!student && !phone) {
          return void result.skipped.push({ row: line, reason: "fullName: validation.required" });
        }
        const forMonth = read(row, "forMonth");
        const comment = [read(row, "comment"), forMonth].filter(Boolean).join(" · ") || "";
        result.matched.push({ row: line, label: `${student ?? phone} · ${paidAt} · ${amount}` });
        lines.push(line);
        out.push([
          "",
          student ?? "",
          phone ?? "",
          read(row, "group") ?? "",
          String(amount),
          paidAt,
          read(row, "method") ?? "",
          comment,
        ]);
        const refunded = parseSignedMoney(read(row, "refunded") ?? "");
        if (refunded && refunded > 0) {
          lines.push(line);
          out.push([
            "",
            student ?? "",
            phone ?? "",
            read(row, "group") ?? "",
            String(-refunded),
            paidAt,
            read(row, "method") ?? "",
            "refund",
          ]);
        }
      });
      merge(result, await importPaymentHistory(actor, { branchId, dryRun }, out, db), lines);
      return result;
    }
  }
}

/**
 * Importers number rows by their position in the converted sheet; `lines` maps
 * each converted data row back to its line in the uploaded file, so the person
 * sees the file's own row numbers. A row the importer skipped leaves the matched
 * list.
 */
function merge(result: SoffRunResult, r: ImportResult, lines: number[]): void {
  result.imported = r.imported;
  const bad = new Set<number>();
  for (const s of r.skipped) {
    const line = lines[s.row - 2] ?? s.row;
    bad.add(line);
    result.skipped.push({ row: line, reason: s.reason });
  }
  if (bad.size > 0) result.matched = result.matched.filter((m) => !bad.has(m.row));
}
