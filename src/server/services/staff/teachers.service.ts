import type { Page } from "@/lib/validation/common";
import type {
  StaffCreateInput,
  StaffSortField,
  StaffUpdateInput,
  TeacherKind,
} from "@/lib/validation/staff";
import type { Prisma } from "@/generated/prisma/client";
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
 * through the `teachers.*` permissions (A-43). Group numbers and the group list
 * come from Phase 5 (A-45): groups the user teaches or supports that are not archived.
 */
export interface TeacherGroupDto {
  id: string;
  name: string;
  courseName: string;
  status: "ACTIVE" | "ARCHIVED" | "TRIAL" | "FROZEN";
  role: "MAIN" | "ASSISTANT" | "CO_TEACHER" | "SUPPORT";
  activeStudents: number;
  startDate: string;
  endDate: string;
}

export interface TeacherDetailDto extends StaffDto {
  stats: { courses: number; activeGroups: number; activeStudents: number };
  groups: TeacherGroupDto[];
}

export interface TeacherRowDto extends StaffDto {
  /** Names of the non-archived groups the person teaches or supports. */
  groupNames: string[];
}

const groupSelect = {
  id: true,
  name: true,
  status: true,
  startDate: true,
  endDate: true,
  course: { select: { name: true } },
  _count: { select: { memberships: { where: { status: { in: ["ACTIVE", "TRIAL"] } } } } },
} satisfies Prisma.GroupSelect;

/** Non-archived groups for a set of users, keyed by user id. */
async function groupsByUser(
  userIds: string[],
  db: DbClient,
): Promise<Map<string, TeacherGroupDto[]>> {
  const out = new Map<string, TeacherGroupDto[]>();
  if (userIds.length === 0) return out;
  const where = { userId: { in: userIds }, group: { status: { not: "ARCHIVED" as const } } };
  const [taught, supported] = await Promise.all([
    db.groupTeacher.findMany({ where, include: { group: { select: groupSelect } } }),
    db.groupSupportTeacher.findMany({ where, include: { group: { select: groupSelect } } }),
  ]);
  const push = (
    userId: string,
    g: (typeof taught)[number]["group"],
    role: TeacherGroupDto["role"],
  ) => {
    const list = out.get(userId) ?? [];
    list.push({
      id: g.id,
      name: g.name,
      courseName: g.course.name,
      status: g.status,
      role,
      activeStudents: g._count.memberships,
      startDate: g.startDate.toISOString().slice(0, 10),
      endDate: g.endDate.toISOString().slice(0, 10),
    });
    out.set(userId, list);
  };
  for (const row of taught) push(row.userId, row.group, row.role);
  for (const row of supported) push(row.userId, row.group, "SUPPORT");
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function listTeachers(
  actor: Actor,
  query: ParsedList<StaffSortField>,
  filters: { kind: TeacherKind; archived?: boolean },
  db: DbClient = prisma,
): Promise<Page<TeacherRowDto>> {
  const page = await listStaff(actor, "teachers", query, filters, db);
  const groups = await groupsByUser(
    page.items.map((p) => p.id),
    db,
  );
  return {
    ...page,
    items: page.items.map((p) => ({
      ...p,
      groupNames: (groups.get(p.id) ?? []).map((g) => g.name),
    })),
  };
}

export async function getTeacher(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<TeacherDetailDto> {
  const teacher = await getStaff(actor, "teachers", id, db);
  const groups = (await groupsByUser([id], db)).get(id) ?? [];
  const courses = new Set(groups.map((g) => g.courseName)).size;
  return {
    ...teacher,
    stats: {
      courses,
      activeGroups: groups.filter((g) => g.status === "ACTIVE").length,
      activeStudents: groups.reduce((sum, g) => sum + g.activeStudents, 0),
    },
    groups,
  };
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
