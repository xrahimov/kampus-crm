import type { GradingSystemInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, authorizeAny, type Actor } from "@/server/rbac/authorize";

import { decimalToNumber, getOrganizationId, mustFind, rethrowAsAppError } from "./shared";

export interface GradingLevelDto {
  id: string;
  name: string;
  minScore: number;
  maxScore: number;
}

export interface GradingSystemDto {
  id: string;
  name: string;
  rounding: "STANDARD" | "IELTS";
  levels: GradingLevelDto[];
  coursesCount: number;
}

const include = {
  levels: { orderBy: { sortOrder: "asc" as const } },
  _count: { select: { courses: true } },
};

type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.gradingSystem.findFirst<{ include: typeof include }>>>
>;

function toDto(row: Row): GradingSystemDto {
  return {
    id: row.id,
    name: row.name,
    rounding: row.rounding,
    coursesCount: row._count.courses,
    levels: row.levels.map((l) => ({
      id: l.id,
      name: l.name,
      minScore: decimalToNumber(l.minScore),
      maxScore: decimalToNumber(l.maxScore),
    })),
  };
}

/** Course forms pick a grading system, so catalog users may read the list too. */
export async function listGradingSystems(
  actor: Actor,
  db: DbClient = prisma,
): Promise<GradingSystemDto[]> {
  authorizeAny(actor, ["settings.org", "settings.catalog"]);
  const organizationId = await getOrganizationId(db);
  const rows = await db.gradingSystem.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include,
  });
  return rows.map(toDto);
}

const levelsData = (levels: GradingSystemInput["levels"]) =>
  levels.map((l, i) => ({
    name: l.name,
    minScore: l.minScore,
    maxScore: l.maxScore,
    sortOrder: i,
  }));

export async function createGradingSystem(
  actor: Actor,
  input: GradingSystemInput,
  db: DbClient = prisma,
): Promise<GradingSystemDto> {
  authorize(actor, "settings.org");
  const organizationId = await getOrganizationId(db);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.gradingSystem.create({
        data: {
          organizationId,
          name: input.name,
          rounding: input.rounding,
          levels: { create: levelsData(input.levels) },
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "gradingSystem.create",
        entity: "GradingSystem",
        entityId: row.id,
        after: dto,
        branchId: null,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** Levels are replaced wholesale: the form always submits the full list. */
export async function updateGradingSystem(
  actor: Actor,
  id: string,
  input: GradingSystemInput,
  db: DbClient = prisma,
): Promise<GradingSystemDto> {
  authorize(actor, "settings.org");
  try {
    return await db.$transaction(async (tx) => {
      const before = toDto(await mustFind(tx.gradingSystem.findUnique({ where: { id }, include })));
      await tx.gradingLevel.deleteMany({ where: { gradingSystemId: id } });
      const row = await tx.gradingSystem.update({
        where: { id },
        data: {
          name: input.name,
          rounding: input.rounding,
          levels: { create: levelsData(input.levels) },
        },
        include,
      });
      const after = toDto(row);
      await recordAudit(tx, actor, {
        action: "gradingSystem.update",
        entity: "GradingSystem",
        entityId: id,
        before,
        after,
        branchId: null,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteGradingSystem(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.org");
  await db.$transaction(async (tx) => {
    const before = toDto(await mustFind(tx.gradingSystem.findUnique({ where: { id }, include })));
    // Courses keep working without a scale (gradingSystemId → null).
    await tx.gradingSystem.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "gradingSystem.delete",
      entity: "GradingSystem",
      entityId: id,
      before,
      branchId: null,
    });
  });
}
