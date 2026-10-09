import type { Prisma } from "@/generated/prisma/client";
import type { AdjustmentInput, BalanceAdjustmentKind } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError, isAppError } from "@/server/errors/app-error";
import { mapColumns, parseSignedMoney, pick, type ColumnSpec } from "@/server/excel/import-columns";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import { refreshStudentDebts } from "@/server/services/debts/debts.service";
import { findGroupInScope } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

import { dataRows, normalizeDate, type ImportResult } from "./import.service";
import { matchStudent } from "./student-match";
import { studentScope } from "./students.service";

/*
 * Opening balances and corrections (A-109). A centre that moves to Kampus brings
 * every student's debt or credit with it; a cashier sometimes has to fix a
 * balance by hand. Both are a signed amount on one membership that the balance
 * engine adds to the student's money, so every list, report and notice sees it.
 */

export interface AdjustmentDto {
  id: string;
  membershipId: string;
  groupId: string;
  groupName: string;
  studentId: string;
  studentName: string;
  branchId: string;
  /** Negative = the student owes this much more; positive = the student has this much more. */
  amount: number;
  kind: BalanceAdjustmentKind;
  date: string;
  comment: string | null;
  createdByName: string | null;
  createdAt: string;
}

const include = {
  student: { select: { fullName: true } },
  membership: { select: { groupId: true, group: { select: { name: true } } } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.BalanceAdjustmentInclude;
type Row = Prisma.BalanceAdjustmentGetPayload<{ include: typeof include }>;

function toDto(row: Row): AdjustmentDto {
  return {
    id: row.id,
    membershipId: row.membershipId,
    groupId: row.membership.groupId,
    groupName: row.membership.group.name,
    studentId: row.studentId,
    studentName: row.student.fullName,
    branchId: row.branchId,
    amount: decimalToNumber(row.amount),
    kind: row.kind,
    date: dateToIso(row.date),
    comment: row.comment,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const LEFT = ["ARCHIVED", "GRADUATED"] as const;

const membershipSelect = {
  id: true,
  studentId: true,
  groupId: true,
  status: true,
  student: { select: { fullName: true, branchId: true } },
  group: { select: { name: true, branchId: true } },
} satisfies Prisma.GroupMembershipSelect;
type MembershipRow = Prisma.GroupMembershipGetPayload<{ select: typeof membershipSelect }>;

async function insertAdjustment(
  db: DbClient,
  actor: Actor,
  m: MembershipRow,
  data: { amount: number; kind: BalanceAdjustmentKind; date: string; comment: string | null },
): Promise<AdjustmentDto> {
  return db.$transaction(async (tx) => {
    const row = await tx.balanceAdjustment.create({
      data: {
        membershipId: m.id,
        studentId: m.studentId,
        branchId: m.group.branchId,
        amount: data.amount,
        kind: data.kind,
        date: isoToDate(data.date),
        comment: data.comment,
        createdById: actor.userId || null,
      },
      include,
    });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "balance.adjust",
      entity: "BalanceAdjustment",
      entityId: row.id,
      after: {
        amount: dto.amount,
        kind: dto.kind,
        date: dto.date,
        groupId: dto.groupId,
        comment: dto.comment,
      },
      branchId: m.group.branchId,
    });
    await refreshStudentDebts(tx, m.studentId);
    return dto;
  });
}

/** "Qoldiqni to'g'rilash" on the student's page. */
export async function createAdjustment(
  actor: Actor,
  input: AdjustmentInput,
  db: DbClient = prisma,
): Promise<AdjustmentDto> {
  authorize(actor, "payments.create");
  const m = await mustFind(
    db.groupMembership.findUnique({ where: { id: input.membershipId }, select: membershipSelect }),
    "errors.memberUnknown",
  );
  await findGroupInScope(db, actor, m.groupId, {});
  return insertAdjustment(db, actor, m, {
    amount: input.amount,
    kind: input.kind,
    date: input.date,
    comment: input.comment ?? null,
  });
}

export async function listStudentAdjustments(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<AdjustmentDto[]> {
  authorize(actor, "students.view");
  const visible = await db.student.count({ where: { id: studentId, ...studentScope(actor) } });
  if (visible === 0) throw AppError.notFound("errors.studentNotFound");
  const rows = await db.balanceAdjustment.findMany({
    where: { studentId },
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toDto);
}

/** Undoing money is the refund permission's job, as for a payment. */
export async function deleteAdjustment(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "payments.refund");
  const row = await mustFind(db.balanceAdjustment.findUnique({ where: { id }, include }));
  await findGroupInScope(db, actor, row.membership.groupId, {});
  await db.$transaction(async (tx) => {
    await tx.balanceAdjustment.delete({ where: { id } });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "balance.adjustRemove",
      entity: "BalanceAdjustment",
      entityId: id,
      before: { amount: dto.amount, kind: dto.kind, date: dto.date, groupId: dto.groupId },
      branchId: row.branchId,
    });
    await refreshStudentDebts(tx, row.studentId);
  });
}

// --- Excel import of opening balances --------------------------------------------

/** The template's columns, in order. `balance` uses Kampus's sign: negative = owes. */
export const BALANCE_IMPORT_COLUMNS = [
  "studentId",
  "fullName",
  "phone",
  "group",
  "balance",
  "date",
  "comment",
] as const;

/** Columns the importer also understands when the file has headers (any order, any language). */
const BALANCE_IMPORT_SPECS: readonly ColumnSpec[] = [
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
  { key: "balance", aliases: ["balans", "qoldiq", "баланс", "остаток", "saldo"] },
  /** Positive numbers in this column mean the student owes (the usual sign of a debtor list). */
  { key: "debt", aliases: ["qarz", "qarzdorlik", "долг", "задолженность", "owes"] },
  { key: "branch", aliases: ["filial", "филиал"] },
  { key: "date", aliases: ["sana", "дата"] },
  { key: "comment", aliases: ["izoh", "eslatma", "комментарий", "примечание", "note"] },
];

export interface BalanceImportResult extends ImportResult {
  /** True when nothing was written: the rows below say what the real run would do. */
  dryRun: boolean;
  /** Rows that matched a student and a group, as "name · group · amount". */
  matched: Array<{ row: number; label: string }>;
  /** Whether the file's header row was recognised (else the template order was assumed). */
  byHeader: boolean;
}

/**
 * Students page → "Import opening balances": one row per student and group with
 * the signed balance they bring from the previous system. Students are found by
 * Kampus id, then phone, then exact name, inside the chosen branch (or the branch
 * named in the row). A membership that already has an opening balance is skipped,
 * so running the same file twice does not double anyone's debt. With `dryRun`
 * nothing is written and the result previews the matches.
 */
export async function importOpeningBalances(
  actor: Actor,
  options: { branchId: string; dryRun: boolean },
  rows: string[][],
  db: DbClient = prisma,
): Promise<BalanceImportResult> {
  authorize(actor, "payments.create");
  authorizeBranch(actor, options.branchId);
  const result: BalanceImportResult = {
    imported: 0,
    skipped: [],
    dryRun: options.dryRun,
    matched: [],
    byHeader: false,
  };
  const header = rows[0] ?? [];
  const map = mapColumns(header, BALANCE_IMPORT_SPECS);
  result.byHeader = map.byHeader;
  const today = dateToIso(new Date());
  const branchesByName = new Map<string, string>();
  if (map.index.branch !== undefined) {
    const branches = await db.branch.findMany({
      where: { id: { in: actor.branchIds } },
      select: { id: true, name: true },
    });
    for (const b of branches) branchesByName.set(b.name.trim().toLowerCase(), b.id);
  }
  const seen = new Set<string>();
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const skip = (reason: string) => result.skipped.push({ row: line, reason });

    const branchName = pick(map, raw, "branch");
    let branchId = options.branchId;
    if (branchName) {
      const found = branchesByName.get(branchName.toLowerCase());
      if (!found) {
        skip("errors.importBranchUnknown");
        continue;
      }
      branchId = found;
    }

    const balanceText = pick(map, raw, "balance");
    const debtText = pick(map, raw, "debt");
    let amount: number | null = null;
    if (balanceText !== null) amount = parseSignedMoney(balanceText);
    else if (debtText !== null) {
      const debt = parseSignedMoney(debtText);
      amount = debt === null ? null : -debt;
    }
    if (amount === null) {
      skip("balance: validation.required");
      continue;
    }
    if (amount === 0) {
      skip("errors.importZero");
      continue;
    }
    const date = normalizeDate(pick(map, raw, "date") ?? "") ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skip("date: validation.date");
      continue;
    }

    const match = await matchStudent(db, branchId, {
      studentId: pick(map, raw, "studentId"),
      phone: pick(map, raw, "phone"),
      fullName: pick(map, raw, "fullName"),
    });
    if (!match.student) {
      skip(match.reason);
      continue;
    }
    const student = match.student;

    const groupName = pick(map, raw, "group");
    const memberships = await db.groupMembership.findMany({
      where: { studentId: student.id, status: { notIn: [...LEFT] } },
      select: membershipSelect,
      orderBy: { joinedAt: "asc" },
    });
    let membership: MembershipRow | undefined;
    if (groupName) {
      membership = memberships.find(
        (m) => m.group.name.trim().toLowerCase() === groupName.toLowerCase(),
      );
      if (!membership) {
        skip("errors.importGroupUnknown");
        continue;
      }
    } else if (memberships.length === 1) {
      membership = memberships[0];
    } else {
      skip(memberships.length === 0 ? "errors.importNoMembership" : "errors.importGroupRequired");
      continue;
    }
    if (seen.has(membership!.id)) {
      skip("errors.importDuplicate");
      continue;
    }
    const existing = await db.balanceAdjustment.count({
      where: { membershipId: membership!.id, kind: "OPENING" },
    });
    if (existing > 0) {
      skip("errors.importBalanceExists");
      continue;
    }
    seen.add(membership!.id);
    result.matched.push({
      row: line,
      label: `${student.fullName} · ${membership!.group.name} · ${amount}`,
    });
    if (options.dryRun) {
      result.imported += 1;
      continue;
    }
    try {
      await insertAdjustment(db, actor, membership!, {
        amount,
        kind: "OPENING",
        date,
        comment: pick(map, raw, "comment"),
      });
      result.imported += 1;
    } catch (error) {
      skip(isAppError(error) ? error.message : "errors.internal");
    }
  }
  return result;
}
