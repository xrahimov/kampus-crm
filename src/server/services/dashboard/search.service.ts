import { prisma, type DbClient } from "@/server/db/prisma";
import { branchScope, can, type Actor } from "@/server/rbac/authorize";
import { ownGroupsOnly } from "@/server/services/groups/shared";

/* EXP §0 header "Qidirish...": students, leads and groups the user may see (A-98). */

export interface SearchResultsDto {
  students: Array<{ id: string; fullName: string; phone: string | null; groups: string[] }>;
  leads: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    boardId: string;
    columnName: string;
  }>;
  groups: Array<{ id: string; name: string; courseName: string; teacherName: string | null }>;
}

const LIMIT = 5;

export async function globalSearch(
  actor: Actor,
  q: string,
  db: DbClient = prisma,
): Promise<SearchResultsDto> {
  const term = q.trim();
  const empty: SearchResultsDto = { students: [], leads: [], groups: [] };
  if (term.length < 2) return empty;
  const scope = branchScope(actor);
  const digits = term.replace(/\D/g, "");
  const nameOrPhone = (phoneField: "phone") => ({
    OR: [
      { fullName: { contains: term, mode: "insensitive" as const } },
      ...(digits.length >= 3 ? [{ [phoneField]: { contains: digits } }] : []),
    ],
  });
  const [students, leads, groups] = await Promise.all([
    can(actor, "students.view")
      ? db.student.findMany({
          where: {
            ...scope,
            isArchived: false,
            ...nameOrPhone("phone"),
            ...(ownGroupsOnly(actor)
              ? {
                  memberships: {
                    some: { group: { teachers: { some: { userId: actor.userId } } } },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            fullName: true,
            phone: true,
            memberships: {
              where: { status: { notIn: ["ARCHIVED", "GRADUATED"] } },
              select: { group: { select: { name: true } } },
            },
          },
          orderBy: { fullName: "asc" },
          take: LIMIT,
        })
      : [],
    can(actor, "leads.view")
      ? db.lead.findMany({
          where: {
            ...scope,
            isArchived: false,
            OR: [
              { fullName: { contains: term, mode: "insensitive" } },
              ...(digits.length >= 3
                ? [{ phones: { some: { phone: { contains: digits } } } }]
                : []),
            ],
          },
          select: {
            id: true,
            fullName: true,
            boardId: true,
            column: { select: { name: true } },
            phones: { orderBy: { sortOrder: "asc" }, take: 1, select: { phone: true } },
          },
          orderBy: { fullName: "asc" },
          take: LIMIT,
        })
      : [],
    can(actor, "groups.view")
      ? db.group.findMany({
          where: {
            ...scope,
            status: { not: "ARCHIVED" },
            name: { contains: term, mode: "insensitive" },
            ...(ownGroupsOnly(actor)
              ? {
                  OR: [
                    { teachers: { some: { userId: actor.userId } } },
                    { supportTeachers: { some: { userId: actor.userId } } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
            course: { select: { name: true } },
            teachers: {
              where: { role: "MAIN" },
              select: { user: { select: { fullName: true } } },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
          take: LIMIT,
        })
      : [],
  ]);
  return {
    students: students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      groups: s.memberships.map((m) => m.group.name),
    })),
    leads: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      phone: l.phones[0]?.phone ?? null,
      boardId: l.boardId,
      columnName: l.column.name,
    })),
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      courseName: g.course.name,
      teacherName: g.teachers[0]?.user.fullName ?? null,
    })),
  };
}
