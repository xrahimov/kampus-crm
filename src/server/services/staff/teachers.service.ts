import type { Page } from "@/lib/validation/common";
import type {
  StaffCreateInput,
  StaffSortField,
  StaffUpdateInput,
  TeacherKind,
} from "@/lib/validation/staff";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import type { Actor } from "@/server/rbac/authorize";

import {
  archiveStaff,
  createStaff,
  getStaff,
  listStaff,
  updateStaff,
  type StaffDto,
} from "./staff.service";

/**
 * Teachers (EXP §4) are staff with the TEACHER or SUPPORT_TEACHER role, seen
 * through the `teachers.*` permissions (A-43). The group-related numbers on the
 * detail card arrive with groups in Phase 5 (A-45); until then they are zero.
 */
export interface TeacherDetailDto extends StaffDto {
  stats: { courses: number; activeGroups: number; activeStudents: number };
}

export function listTeachers(
  actor: Actor,
  query: ParsedList<StaffSortField>,
  filters: { kind: TeacherKind; archived?: boolean },
  db: DbClient = prisma,
): Promise<Page<StaffDto>> {
  return listStaff(actor, "teachers", query, filters, db);
}

export async function getTeacher(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<TeacherDetailDto> {
  const teacher = await getStaff(actor, "teachers", id, db);
  return { ...teacher, stats: { courses: 0, activeGroups: 0, activeStudents: 0 } };
}

export function createTeacher(actor: Actor, input: StaffCreateInput, db: DbClient = prisma) {
  return createStaff(actor, "teachers", input, db);
}

export function updateTeacher(
  actor: Actor,
  id: string,
  input: StaffUpdateInput,
  db: DbClient = prisma,
) {
  return updateStaff(actor, "teachers", id, input, db);
}

export function archiveTeacher(actor: Actor, id: string, db: DbClient = prisma) {
  return archiveStaff(actor, "teachers", id, db);
}
