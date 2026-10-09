import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError, isAppError } from "@/server/errors/app-error";
import { mapColumns, parseSignedMoney, pick, type ColumnSpec } from "@/server/excel/import-columns";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

import { dataRows, normalizeDate, normalizePhone, type ImportResult } from "./import.service";
import { matchStudent } from "./student-match";
import { studentScope } from "./students.service";

/*
 * The optional second pass of a migration (A-142): the students who had already
 * left the previous system, with their leave date and reason, so the churn report
 * and the archive are complete from day one; and the payments they and everyone
 * else made there, kept as history rows that count in no balance.
 */

export interface HistoryImportResult extends ImportResult {
  dryRun: boolean;
  matched: Array<{ row: number; label: string }>;
  byHeader: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function emptyResult(dryRun: boolean): HistoryImportResult {
  return { imported: 0, skipped: [], dryRun, matched: [], byHeader: false };
}

// --- Archived students --------------------------------------------------------------

/** The template's columns, in order. */
export const ARCHIVED_IMPORT_COLUMNS = [
  "fullName",
  "phone",
  "group",
  "joinedAt",
  "leftAt",
  "reason",
  "note",
] as const;

const ARCHIVED_IMPORT_SPECS: readonly ColumnSpec[] = [
  {
    key: "fullName",
    aliases: [
      "name",
      "student",
      "student name",
      "fio",
      "f.i.o",
      "фио",
      "имя",
      "ученик",
      "студент",
      "ism",
      "ism familiya",
      "to'liq ism",
      "talaba",
      "o'quvchi",
    ],
  },
  { key: "phone", aliases: ["telefon", "телефон", "tel", "phone number", "raqam", "номер"] },
  { key: "group", aliases: ["guruh", "группа", "group name"] },
  {
    key: "joinedAt",
    aliases: ["joined", "joined on", "start", "qo'shilgan", "kelgan", "пришёл", "пришел", "начало"],
  },
  {
    key: "leftAt",
    aliases: [
      "left",
      "left on",
      "end",
      "ketgan",
      "chiqib ketgan",
      "ушёл",
      "ушел",
      "конец",
      "дата ухода",
    ],
  },
  {
    key: "reason",
    aliases: ["leave reason", "sabab", "ketish sababi", "причина", "причина ухода"],
  },
  { key: "note", aliases: ["izoh", "eslatma", "комментарий", "примечание", "comment"] },
];

/**
 * Students page → "Import archived students": one row per student who had already
 * left. Each becomes an archived student; with a group named, also a closed
 * membership carrying the join and leave dates and the reason, so the churn report
 * sees them. A student of the branch with the same phone (or, without a phone,
 * the same name among archived students) is skipped, so the same file can be
 * uploaded twice. With `dryRun` nothing is written.
 */
export async function importArchivedStudents(
  actor: Actor,
  options: { branchId: string; dryRun: boolean },
  rows: string[][],
  db: DbClient = prisma,
): Promise<HistoryImportResult> {
  authorize(actor, "students.create");
  authorizeBranch(actor, options.branchId);
  const result = emptyResult(options.dryRun);
  const map = mapColumns(rows[0] ?? [], ARCHIVED_IMPORT_SPECS);
  result.byHeader = map.byHeader;
  const groups = await db.group.findMany({
    where: { branchId: options.branchId },
    select: { id: true, name: true },
  });
  const groupsByName = new Map(groups.map((g) => [g.name.trim().toLowerCase(), g.id]));
  const seen = new Set<string>();
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });

    const fullName = pick(map, raw, "fullName");
    if (!fullName || fullName.length < 2) {
      skip("fullName: validation.required");
      continue;
    }
    const phoneText = pick(map, raw, "phone");
    const phone = phoneText ? normalizePhone(phoneText) : null;
    if (phoneText && !phone) {
      skip("phone: validation.phone");
      continue;
    }
    const leftAt = normalizeDate(pick(map, raw, "leftAt") ?? "");
    if (!leftAt || !DATE.test(leftAt)) {
      skip("leftAt: validation.date");
      continue;
    }
    const joinedAt = normalizeDate(pick(map, raw, "joinedAt") ?? "") ?? leftAt;
    if (!DATE.test(joinedAt) || joinedAt > leftAt) {
      skip("joinedAt: validation.date");
      continue;
    }
    const groupName = pick(map, raw, "group");
    const groupId = groupName ? groupsByName.get(groupName.toLowerCase()) : undefined;
    if (groupName && !groupId) {
      skip("errors.importGroupMissing");
      continue;
    }
    const key = phone ?? fullName.toLowerCase();
    if (seen.has(key)) {
      skip("errors.importDuplicate");
      continue;
    }
    const existing = await db.student.findFirst({
      where: phone
        ? { branchId: options.branchId, phone }
        : { branchId: options.branchId, fullName: { equals: fullName, mode: "insensitive" } },
      select: { isArchived: true },
    });
    if (existing) {
      skip(existing.isArchived ? "errors.importArchivedExists" : "errors.importExists");
      continue;
    }
    seen.add(key);
    result.matched.push({
      row: line,
      label: `${fullName}${groupName ? ` · ${groupName}` : ""} · ${leftAt}`,
    });
    if (options.dryRun) {
      result.imported += 1;
      continue;
    }
    try {
      await db.$transaction(async (tx) => {
        const student = await tx.student.create({
          data: {
            branchId: options.branchId,
            fullName,
            phone,
            note: pick(map, raw, "note"),
            isArchived: true,
          },
          select: { id: true },
        });
        await recordAudit(tx, actor, {
          action: "student.importArchived",
          entity: "Student",
          entityId: student.id,
          after: { fullName, phone, leftAt, group: groupName },
          branchId: options.branchId,
        });
        if (groupId) {
          const membership = await tx.groupMembership.create({
            data: {
              groupId,
              studentId: student.id,
              status: "ARCHIVED",
              joinedAt: isoToDate(joinedAt),
              activatedAt: isoToDate(joinedAt),
              leftAt: isoToDate(leftAt),
              leaveReason: pick(map, raw, "reason"),
            },
            select: { id: true },
          });
          await recordAudit(tx, actor, {
            action: "membership.create",
            entity: "GroupMembership",
            entityId: membership.id,
            after: { studentId: student.id, groupId, status: "ARCHIVED", joinedAt, leftAt },
            branchId: options.branchId,
          });
        }
      });
      result.imported += 1;
    } catch (error) {
      skip(isAppError(error) ? error.message : "errors.internal");
    }
  }
  return result;
}

// --- Payment history ----------------------------------------------------------------

export interface LegacyPaymentDto {
  id: string;
  studentId: string;
  groupName: string | null;
  amount: number;
  paidAt: string;
  method: string | null;
  comment: string | null;
  createdByName: string | null;
  createdAt: string;
}

const include = {
  createdBy: { select: { fullName: true } },
} satisfies Prisma.LegacyPaymentInclude;
type Row = Prisma.LegacyPaymentGetPayload<{ include: typeof include }>;

function toDto(row: Row): LegacyPaymentDto {
  return {
    id: row.id,
    studentId: row.studentId,
    groupName: row.groupName,
    amount: decimalToNumber(row.amount),
    paidAt: dateToIso(row.paidAt),
    method: row.method,
    comment: row.comment,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The template's columns, in order. */
export const HISTORY_IMPORT_COLUMNS = [
  "studentId",
  "fullName",
  "phone",
  "group",
  "amount",
  "paidAt",
  "method",
  "comment",
] as const;

const HISTORY_IMPORT_SPECS: readonly ColumnSpec[] = [
  { key: "studentId", aliases: ["id", "kampus id", "student id", "talaba id", "o'quvchi id"] },
  {
    key: "fullName",
    aliases: [
      "name",
      "student",
      "student name",
      "fio",
      "f.i.o",
      "фио",
      "имя",
      "ученик",
      "студент",
      "ism",
      "ism familiya",
      "to'liq ism",
      "talaba",
      "o'quvchi",
    ],
  },
  { key: "phone", aliases: ["telefon", "телефон", "tel", "phone number", "raqam", "номер"] },
  { key: "group", aliases: ["guruh", "группа", "group name"] },
  { key: "amount", aliases: ["summa", "сумма", "paid", "to'lov", "оплата", "payment"] },
  { key: "paidAt", aliases: ["date", "paid at", "sana", "дата", "to'langan", "дата оплаты"] },
  {
    key: "method",
    aliases: ["payment method", "usul", "to'lov usuli", "способ", "способ оплаты", "type", "turi"],
  },
  { key: "comment", aliases: ["izoh", "eslatma", "комментарий", "примечание", "note"] },
];

/**
 * Students page → "Import payment history": one row per payment made in the previous
 * system. Students, archived ones included, are found by Kampus id, phone or exact
 * name. The rows are kept for the record only: no balance, debtor list or report
 * changes. A row the student already has (same date, amount and group) is skipped.
 */
export async function importPaymentHistory(
  actor: Actor,
  options: { branchId: string; dryRun: boolean },
  rows: string[][],
  db: DbClient = prisma,
): Promise<HistoryImportResult> {
  authorize(actor, "payments.create");
  authorizeBranch(actor, options.branchId);
  const result = emptyResult(options.dryRun);
  const map = mapColumns(rows[0] ?? [], HISTORY_IMPORT_SPECS);
  result.byHeader = map.byHeader;
  const seen = new Set<string>();
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });

    const amount = parseSignedMoney(pick(map, raw, "amount") ?? "");
    if (amount === null) {
      skip("amount: validation.required");
      continue;
    }
    if (amount === 0) {
      skip("errors.importZero");
      continue;
    }
    const paidAt = normalizeDate(pick(map, raw, "paidAt") ?? "");
    if (!paidAt || !DATE.test(paidAt)) {
      skip("paidAt: validation.date");
      continue;
    }
    const match = await matchStudent(
      db,
      options.branchId,
      {
        studentId: pick(map, raw, "studentId"),
        phone: pick(map, raw, "phone"),
        fullName: pick(map, raw, "fullName"),
      },
      { includeArchived: true },
    );
    if (!match.student) {
      skip(match.reason);
      continue;
    }
    const student = match.student;
    const groupName = pick(map, raw, "group");
    const key = `${student.id}|${paidAt}|${amount}|${groupName?.toLowerCase() ?? ""}`;
    if (seen.has(key)) {
      skip("errors.importDuplicate");
      continue;
    }
    const existing = await db.legacyPayment.count({
      where: {
        studentId: student.id,
        paidAt: isoToDate(paidAt),
        amount,
        groupName: groupName ? { equals: groupName, mode: "insensitive" } : null,
      },
    });
    if (existing > 0) {
      skip("errors.importPaymentExists");
      continue;
    }
    seen.add(key);
    result.matched.push({
      row: line,
      label: `${student.fullName}${groupName ? ` · ${groupName}` : ""} · ${paidAt} · ${amount}`,
    });
    if (options.dryRun) {
      result.imported += 1;
      continue;
    }
    try {
      await db.$transaction(async (tx) => {
        const row = await tx.legacyPayment.create({
          data: {
            studentId: student.id,
            branchId: options.branchId,
            groupName,
            amount,
            paidAt: isoToDate(paidAt),
            method: pick(map, raw, "method"),
            comment: pick(map, raw, "comment"),
            createdById: actor.userId || null,
          },
          select: { id: true },
        });
        await recordAudit(tx, actor, {
          action: "payment.importHistory",
          entity: "LegacyPayment",
          entityId: row.id,
          after: { studentId: student.id, amount, paidAt, group: groupName },
          branchId: options.branchId,
        });
      });
      result.imported += 1;
    } catch (error) {
      skip(isAppError(error) ? error.message : "errors.internal");
    }
  }
  return result;
}

export async function listStudentPaymentHistory(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<LegacyPaymentDto[]> {
  authorize(actor, "students.view");
  const visible = await db.student.count({ where: { id: studentId, ...studentScope(actor) } });
  if (visible === 0) throw AppError.notFound("errors.studentNotFound");
  const rows = await db.legacyPayment.findMany({
    where: { studentId },
    include,
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toDto);
}

/** A wrongly imported row goes away like a refund would: the refund permission's job. */
export async function deleteLegacyPayment(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "payments.refund");
  const row = await mustFind(db.legacyPayment.findUnique({ where: { id }, include }));
  authorizeBranch(actor, row.branchId);
  await db.$transaction(async (tx) => {
    await tx.legacyPayment.delete({ where: { id } });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "payment.importHistoryRemove",
      entity: "LegacyPayment",
      entityId: id,
      before: { studentId: dto.studentId, amount: dto.amount, paidAt: dto.paidAt },
      branchId: row.branchId,
    });
  });
}
