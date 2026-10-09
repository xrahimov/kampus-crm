import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";

import { normalizePhone } from "./import.service";

export type MatchedStudent = { id: string; fullName: string };
export type StudentMatch =
  | { student: MatchedStudent; reason: null }
  | { student: null; reason: "errors.importAmbiguous" | "errors.studentNotFound" };

/**
 * The student an import row means (A-109): by Kampus id, then by phone, then by
 * exact name (case-insensitive), inside one branch. Two students sharing the
 * phone or the name are ambiguous rather than a guess.
 */
export async function matchStudent(
  db: DbClient,
  branchId: string,
  row: { studentId: string | null; phone: string | null; fullName: string | null },
): Promise<StudentMatch> {
  const where: Prisma.StudentWhereInput = { branchId, isArchived: false };
  const select = { id: true, fullName: true } as const;
  let student: MatchedStudent | null = null;
  if (row.studentId) {
    student = await db.student.findFirst({ where: { id: row.studentId, branchId }, select });
  } else if (row.phone && normalizePhone(row.phone)) {
    const candidates = await db.student.findMany({
      where: { ...where, phone: normalizePhone(row.phone)! },
      select,
      take: 2,
    });
    if (candidates.length > 1) return { student: null, reason: "errors.importAmbiguous" };
    student = candidates[0] ?? null;
  }
  if (!student && row.fullName) {
    const candidates = await db.student.findMany({
      where: { ...where, fullName: { equals: row.fullName, mode: "insensitive" } },
      select,
      take: 2,
    });
    if (candidates.length > 1) return { student: null, reason: "errors.importAmbiguous" };
    student = candidates[0] ?? null;
  }
  return student ? { student, reason: null } : { student: null, reason: "errors.studentNotFound" };
}
