import type { Prisma } from "@/generated/prisma/client";
import type { QuestionInput } from "@/lib/validation/tests";
import type { Page } from "@/lib/validation/common";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { getOrganizationId, mustFind } from "@/server/services/settings/shared";

/* Question bank (EXP §8 Test sozlamalari → Savollar banki). A-81. */

export interface QuestionDto {
  id: string;
  subject: string;
  topic: string;
  text: string;
  options: string[];
  correctIndex: number;
  usedInTests: number;
  createdAt: string;
}

export interface QuestionBankOptions {
  subjects: string[];
  topics: Array<{ subject: string; topic: string }>;
}

export const QUESTION_SORT_FIELDS = ["subject", "topic", "createdAt"] as const;
export type QuestionSortField = (typeof QUESTION_SORT_FIELDS)[number];

const include = { _count: { select: { usages: true } } } satisfies Prisma.QuestionBankItemInclude;
type Row = Prisma.QuestionBankItemGetPayload<{ include: typeof include }>;

export function optionsOf(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

function toDto(row: Row): QuestionDto {
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    text: row.text,
    options: optionsOf(row.options),
    correctIndex: row.correctIndex,
    usedInTests: row._count.usages,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listQuestions(
  actor: Actor,
  list: ParsedList<QuestionSortField>,
  filters: { subject?: string; topic?: string },
  db: DbClient = prisma,
): Promise<Page<QuestionDto>> {
  authorize(actor, "tests.view");
  const organizationId = await getOrganizationId(db);
  const where: Prisma.QuestionBankItemWhereInput = {
    organizationId,
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(list.q
      ? {
          OR: [
            { text: { contains: list.q, mode: "insensitive" } },
            { topic: { contains: list.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.questionBankItem.findMany({
      where,
      include,
      orderBy: [{ [list.sort.field]: list.sort.direction }, { id: "asc" }],
      skip: list.skip,
      take: list.take,
    }),
    db.questionBankItem.count({ where }),
  ]);
  return { items: items.map(toDto), page: list.page, pageSize: list.pageSize, total };
}

/** Distinct subjects and topics, for the filters and the test builder. */
export async function getQuestionBankOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<QuestionBankOptions> {
  authorize(actor, "tests.view");
  const organizationId = await getOrganizationId(db);
  const rows = await db.questionBankItem.groupBy({
    by: ["subject", "topic"],
    where: { organizationId },
    orderBy: [{ subject: "asc" }, { topic: "asc" }],
  });
  return {
    subjects: [...new Set(rows.map((r) => r.subject))],
    topics: rows.map((r) => ({ subject: r.subject, topic: r.topic })),
  };
}

export async function createQuestion(
  actor: Actor,
  input: QuestionInput,
  db: DbClient = prisma,
): Promise<QuestionDto> {
  authorize(actor, "tests.create");
  const organizationId = await getOrganizationId(db);
  return db.$transaction(async (tx) => {
    const row = await tx.questionBankItem.create({
      data: { organizationId, ...input, createdById: actor.userId },
      include,
    });
    await recordAudit(tx, actor, {
      action: "question.create",
      entity: "QuestionBankItem",
      entityId: row.id,
      after: input,
    });
    return toDto(row);
  });
}

export async function updateQuestion(
  actor: Actor,
  id: string,
  input: QuestionInput,
  db: DbClient = prisma,
): Promise<QuestionDto> {
  authorize(actor, "tests.update");
  const organizationId = await getOrganizationId(db);
  const before = await mustFind(
    db.questionBankItem.findFirst({ where: { id, organizationId }, include }),
    "errors.questionNotFound",
  );
  return db.$transaction(async (tx) => {
    const row = await tx.questionBankItem.update({ where: { id }, data: input, include });
    await recordAudit(tx, actor, {
      action: "question.update",
      entity: "QuestionBankItem",
      entityId: id,
      before: toDto(before),
      after: input,
    });
    return toDto(row);
  });
}

export async function deleteQuestion(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "tests.delete");
  const organizationId = await getOrganizationId(db);
  const before = await mustFind(
    db.questionBankItem.findFirst({ where: { id, organizationId }, include }),
    "errors.questionNotFound",
  );
  if (before._count.usages > 0) throw AppError.conflict("errors.questionInUse");
  await db.$transaction(async (tx) => {
    await tx.questionBankItem.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "question.delete",
      entity: "QuestionBankItem",
      entityId: id,
      before: toDto(before),
    });
  });
}
