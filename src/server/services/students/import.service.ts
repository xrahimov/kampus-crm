import { z } from "zod";

import { phoneSchema } from "@/lib/validation/common";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError, isAppError } from "@/server/errors/app-error";
import {
  authorize,
  authorizeBranch,
  canAccessAllBranches,
  type Actor,
} from "@/server/rbac/authorize";
import { addMember } from "@/server/services/groups/memberships.service";
import { findGroupInScope } from "@/server/services/groups/shared";

import { createStudent } from "./students.service";

/*
 * "EXCEL ORQALI QO'SHISH" (EXP §5 add-student dialog, §6 students page; A-24, A-90).
 * The template's first row is the header; every later row is one student. Rows
 * are validated one by one and the result says which were skipped and why, so a
 * half-good file still imports the good half.
 */

export const STUDENT_IMPORT_COLUMNS = ["fullName", "phone", "gender", "birthDate", "note"] as const;
export const MEMBER_IMPORT_COLUMNS = [
  "fullName",
  "phone",
  "joinedAt",
  "customPrice",
  "note",
] as const;
export const IMPORT_MAX_ROWS = 1000;

export interface ImportResult {
  imported: number;
  skipped: Array<{ row: number; reason: string }>;
}

/** "+998901234567", "998901234567", "901234567", "+998 90 123-45-67" → "+998901234567". */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith("998")) return `+${digits}`;
  return raw.trim();
}

/** "2026-09-01", "01.09.2026", "1/9/2026" → "2026-09-01". */
export function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return v;
}

const GENDER_WORDS: Record<string, "MALE" | "FEMALE"> = {
  m: "MALE",
  male: "MALE",
  erkak: "MALE",
  мужской: "MALE",
  м: "MALE",
  f: "FEMALE",
  female: "FEMALE",
  ayol: "FEMALE",
  женский: "FEMALE",
  ж: "FEMALE",
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date");
const studentRowSchema = z.object({
  fullName: z.string().trim().min(2, "validation.required").max(120, "validation.tooLong"),
  phone: phoneSchema.nullable(),
  gender: z.enum(["MALE", "FEMALE"]).nullable(),
  birthDate: date.nullable(),
  note: z.string().trim().max(500, "validation.tooLong").nullable(),
});
/** A member row needs a name or a phone: an existing student is matched by either (A-90). */
const memberRowSchema = z.object({
  fullName: z.string().trim().max(120, "validation.tooLong"),
  phone: phoneSchema.nullable(),
  joinedAt: date.nullable(),
  customPrice: z.coerce.number().min(0).max(9_999_999_999).nullable(),
  note: z.string().trim().max(500, "validation.tooLong").nullable(),
});

const cell = (row: string[], i: number) => (row[i] ?? "").trim() || null;

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${String(issue.path[0] ?? "")}: ${issue.message}` : "validation.invalid";
}

function dataRows(rows: string[][]): string[][] {
  if (rows.length === 0) return [];
  if (rows.length > IMPORT_MAX_ROWS + 1)
    throw AppError.validation({ file: ["validation.importTooLarge"] });
  // The first row is the header (the template ships one). Rows with nothing in
  // them (trailing blanks in a hand-edited sheet) are not records.
  return rows.slice(1).filter((row) => row.some((v) => v.trim() !== ""));
}

/** Students page import: new students in one branch, matched by phone to skip duplicates. */
export async function importStudents(
  actor: Actor,
  branchId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "students.create");
  authorizeBranch(actor, branchId);
  const result: ImportResult = { imported: 0, skipped: [] };
  const seen = new Set<string>();
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const genderWord = cell(raw, 2)?.toLowerCase() ?? "";
    const parsed = studentRowSchema.safeParse({
      fullName: cell(raw, 0) ?? "",
      phone: cell(raw, 1) ? normalizePhone(cell(raw, 1)!) : null,
      gender: genderWord ? (GENDER_WORDS[genderWord] ?? "invalid") : null,
      birthDate: normalizeDate(cell(raw, 3) ?? ""),
      note: cell(raw, 4),
    });
    if (!parsed.success) {
      result.skipped.push({ row: line, reason: firstIssue(parsed.error) });
      continue;
    }
    const s = parsed.data;
    if (s.phone) {
      if (seen.has(s.phone)) {
        result.skipped.push({ row: line, reason: "errors.importDuplicate" });
        continue;
      }
      const existing = await db.student.findFirst({
        where: { branchId, phone: s.phone, isArchived: false },
        select: { id: true },
      });
      if (existing) {
        result.skipped.push({ row: line, reason: "errors.importExists" });
        continue;
      }
      seen.add(s.phone);
    }
    try {
      await createStudent(
        actor,
        {
          branchId,
          fullName: s.fullName,
          phone: s.phone,
          gender: s.gender ?? "MALE",
          birthDate: s.birthDate,
          note: s.note,
        },
        db,
      );
      result.imported += 1;
    } catch (error) {
      result.skipped.push({
        row: line,
        reason: isAppError(error) ? error.message : "errors.internal",
      });
    }
  }
  return result;
}

/** Group dialog import: existing students (by phone, then exact name) join; unknown ones are created. */
export async function importMembers(
  actor: Actor,
  groupId: string,
  rows: string[][],
  db: DbClient = prisma,
): Promise<ImportResult> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const result: ImportResult = { imported: 0, skipped: [] };
  const today = new Date().toISOString().slice(0, 10);
  let line = 1;
  for (const raw of dataRows(rows)) {
    line += 1;
    const parsed = memberRowSchema.safeParse({
      fullName: cell(raw, 0) ?? "",
      phone: cell(raw, 1) ? normalizePhone(cell(raw, 1)!) : null,
      joinedAt: normalizeDate(cell(raw, 2) ?? ""),
      customPrice: cell(raw, 3) ? cell(raw, 3)!.replace(/[^\d.]/g, "") : null,
      note: cell(raw, 4),
    });
    if (!parsed.success) {
      result.skipped.push({ row: line, reason: firstIssue(parsed.error) });
      continue;
    }
    const m = parsed.data;
    if (!m.phone && m.fullName.length < 2) {
      result.skipped.push({ row: line, reason: "fullName: validation.required" });
      continue;
    }
    const branchWhere = canAccessAllBranches(actor)
      ? { branchId: group.branchId }
      : { branchId: { in: actor.branchIds } };
    const existing = await db.student.findFirst({
      where: {
        ...branchWhere,
        isArchived: false,
        ...(m.phone
          ? { phone: m.phone }
          : { fullName: { equals: m.fullName, mode: "insensitive" } }),
      },
      select: { id: true },
    });
    if (!existing && m.fullName.length < 2) {
      // A phone nobody has, and no name to create a student with.
      result.skipped.push({ row: line, reason: "errors.studentNotFound" });
      continue;
    }
    try {
      await addMember(
        actor,
        groupId,
        {
          ...(existing
            ? { studentId: existing.id }
            : { newStudent: { fullName: m.fullName, phone: m.phone } }),
          joinedAt: m.joinedAt ?? today,
          customPrice: m.customPrice,
          note: m.note,
          status: "NEW",
        },
        db,
      );
      result.imported += 1;
    } catch (error) {
      const reason =
        isAppError(error) && error.fields?.studentId?.[0] === "validation.duplicate"
          ? "errors.importAlreadyIn"
          : isAppError(error)
            ? error.message
            : "errors.internal";
      result.skipped.push({ row: line, reason });
    }
  }
  return result;
}
