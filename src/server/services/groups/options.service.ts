import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

/**
 * Reference lists for the group form and filters, readable with `groups.view`
 * (the settings services require catalogue rights, which a cashier or watcher
 * who may still browse groups does not hold).
 */
export interface GroupFormOptions {
  courses: Array<{
    id: string;
    branchId: string;
    name: string;
    color: string | null;
    isArchived: boolean;
  }>;
  rooms: Array<{ id: string; branchId: string; name: string }>;
  gradingSystems: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; fullName: string; branchIds: string[] }>;
}

export async function getGroupFormOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<GroupFormOptions> {
  authorize(actor, "groups.view");
  const scope = branchScope(actor) ?? {};
  const [courses, rooms, gradingSystems, teachers] = await Promise.all([
    db.course.findMany({
      where: { ...scope, isArchived: false },
      select: { id: true, branchId: true, name: true, color: true, isArchived: true },
      orderBy: { name: "asc" },
    }),
    db.room.findMany({
      where: scope,
      select: { id: true, branchId: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.gradingSystem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: {
        isArchived: false,
        roles: { some: { role: { code: { in: TEACHER_ROLE_CODES } } } },
        ...(Object.keys(scope).length ? { branches: { some: scope } } : {}),
      },
      select: { id: true, fullName: true, branches: { select: { branchId: true } } },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    courses,
    rooms,
    gradingSystems,
    teachers: teachers.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      branchIds: u.branches.map((b) => b.branchId),
    })),
  };
}
