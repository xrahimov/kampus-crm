import type { Page } from "@/lib/validation/common";
import type { CourseInput, CourseUpdateInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";

import { decimalToNumber, mustFind, rethrowAsAppError } from "./shared";

export interface CourseDto {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  description: string | null;
  price: number;
  durationMonths: number;
  gradingSystemId: string | null;
  gradingSystemName: string | null;
  color: string | null;
  isArchived: boolean;
}

export const COURSE_SORT_FIELDS = ["name", "price", "durationMonths", "createdAt"] as const;
export type CourseSortField = (typeof COURSE_SORT_FIELDS)[number];

export interface CourseFilters {
  archived?: boolean;
}

const include = {
  branch: { select: { name: true } },
  gradingSystem: { select: { name: true } },
};

type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.course.findFirst<{ include: typeof include }>>>
>;

function toDto(row: Row): CourseDto {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    name: row.name,
    description: row.description,
    price: decimalToNumber(row.price),
    durationMonths: row.durationMonths,
    gradingSystemId: row.gradingSystemId,
    gradingSystemName: row.gradingSystem?.name ?? null,
    color: row.color,
    isArchived: row.isArchived,
  };
}

/** EXP §8 Courses list. Scoped to the actor's branches / active branch. */
export async function listCourses(
  actor: Actor,
  query: ParsedList<CourseSortField>,
  filters: CourseFilters = {},
  db: DbClient = prisma,
): Promise<Page<CourseDto>> {
  authorize(actor, "settings.catalog");
  const where = {
    ...branchScope(actor),
    isArchived: filters.archived ?? false,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.course.count({ where }),
    db.course.findMany({
      where,
      include,
      orderBy: { [query.sort.field]: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function getCourse(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<CourseDto> {
  authorize(actor, "settings.catalog");
  const row = await mustFind(db.course.findUnique({ where: { id }, include }));
  authorizeBranch(actor, row.branchId);
  return toDto(row);
}

export async function createCourse(
  actor: Actor,
  input: CourseInput,
  db: DbClient = prisma,
): Promise<CourseDto> {
  authorize(actor, "settings.catalog");
  authorizeBranch(actor, input.branchId);
  await mustFind(
    db.branch.findFirst({ where: { id: input.branchId, isActive: true } }),
    "errors.branchNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.course.create({
        data: {
          branchId: input.branchId,
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          durationMonths: input.durationMonths,
          gradingSystemId: input.gradingSystemId ?? null,
          color: input.color ?? null,
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "course.create",
        entity: "Course",
        entityId: row.id,
        after: dto,
        branchId: row.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "gradingSystemId");
  }
}

export async function updateCourse(
  actor: Actor,
  id: string,
  input: CourseUpdateInput,
  db: DbClient = prisma,
): Promise<CourseDto> {
  authorize(actor, "settings.catalog");
  try {
    return await db.$transaction(async (tx) => {
      const existing = await mustFind(tx.course.findUnique({ where: { id }, include }));
      authorizeBranch(actor, existing.branchId);
      const before = toDto(existing);
      const row = await tx.course.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...("description" in input ? { description: input.description ?? null } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.durationMonths !== undefined ? { durationMonths: input.durationMonths } : {}),
          ...("gradingSystemId" in input ? { gradingSystemId: input.gradingSystemId ?? null } : {}),
          ...("color" in input ? { color: input.color ?? null } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
        },
        include,
      });
      const after = toDto(row);
      await recordAudit(tx, actor, {
        action: "course.update",
        entity: "Course",
        entityId: id,
        before,
        after,
        branchId: row.branchId,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "gradingSystemId");
  }
}

/** Groups will reference courses (Phase 5), so "delete" archives (A-38). */
export async function archiveCourse(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  await updateCourse(actor, id, { isArchived: true }, db);
}
