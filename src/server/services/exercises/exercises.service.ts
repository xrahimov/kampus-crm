import type { Prisma } from "@/generated/prisma/client";
import { itemMax, scoreExercise, seededShuffle } from "@/lib/exercises/score";
import {
  exerciseItemSchema,
  type ExerciseAnswer,
  type ExerciseAttemptInput,
  type ExerciseBodyInput,
  type ExerciseInput,
  type ExerciseItem,
  type ExerciseKind,
} from "@/lib/validation/exercises";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope } from "@/server/services/groups/shared";
import {
  canEditTopicContent,
  releaseOf,
  topicOpen,
} from "@/server/services/settings/topic-content.service";
import { dateToIso } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Self-check exercises (A-158, online-lessons item C2). An exercise sits on a
 * syllabus topic (every group of the course gets it once the topic is open to
 * them) or on one group's homework. Students do it as often as they like from
 * their page; the server scores it, keeps every go and shows the best one.
 * Writing follows the topic content rule (catalogue right or a teacher of the
 * course) or, on homework, the attendance right of the group.
 */

export interface ExerciseDto {
  id: string;
  topicId: string | null;
  homeworkId: string | null;
  title: string;
  items: ExerciseItem[];
  maxScore: number;
  /** Students who tried it at least once (within the actor's groups). */
  attempted: number;
  createdByName: string | null;
  updatedAt: string;
}

export interface ExerciseResultRowDto {
  studentId: string;
  fullName: string;
  groupName: string;
  attempts: number;
  bestScore: number;
  maxScore: number;
  bestPercent: number;
  lastAt: string;
}

/** An item as the student sees it: no answer key, choices in a stable shuffled order. */
export type PortalExerciseItem =
  | { kind: "CHOICE"; prompt: string; options: string[]; multiple: boolean }
  | { kind: "TRUE_FALSE"; prompt: string }
  | { kind: "GAP"; prompt: string; gaps: number }
  | { kind: "MATCH"; prompt: string; lefts: string[]; rights: string[] }
  | { kind: "ORDER"; prompt: string; pieces: string[] }
  | { kind: "SHORT"; prompt: string };

export interface PortalExerciseSummaryDto {
  id: string;
  title: string;
  itemCount: number;
  attempts: number;
  best: { score: number; maxScore: number; percent: number } | null;
}

export interface PortalExerciseDto extends PortalExerciseSummaryDto {
  items: PortalExerciseItem[];
}

export interface PortalExerciseResultDto {
  score: number;
  maxScore: number;
  percent: number;
  /** Per item: right or not, and the key to learn from. */
  items: Array<{ correct: boolean; points: number; max: number; key: string[] }>;
  best: { score: number; maxScore: number; percent: number };
  attempts: number;
}

const include = {
  createdBy: { select: { fullName: true } },
  topic: { select: { id: true, course: { select: { id: true, branchId: true } } } },
  homework: { select: { id: true, groupId: true, group: { select: { branchId: true } } } },
} satisfies Prisma.ExerciseInclude;
type Row = Prisma.ExerciseGetPayload<{ include: typeof include }>;

/** Rows are validated on the way in, so a stored list parses; a broken one is dropped rather than thrown. */
export function parseItems(raw: unknown): ExerciseItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const parsed = exerciseItemSchema.safeParse(x);
    return parsed.success ? [parsed.data] : [];
  });
}

const maxOf = (items: ExerciseItem[]) => items.reduce((s, i) => s + itemMax(i), 0);

async function toDto(db: DbClient, actor: Actor, row: Row): Promise<ExerciseDto> {
  const items = parseItems(row.items);
  const attempted = await db.exerciseAttempt.findMany({
    where: { exerciseId: row.id, membership: { group: groupScope(actor) } },
    distinct: ["membershipId"],
    select: { membershipId: true },
  });
  return {
    id: row.id,
    topicId: row.topicId,
    homeworkId: row.homeworkId,
    title: row.title,
    items,
    maxScore: maxOf(items),
    attempted: attempted.length,
    createdByName: row.createdBy?.fullName ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The topic's course or the homework's group must be in the actor's branches. */
async function anchorInScope(
  db: DbClient,
  actor: Actor,
  anchor: { topicId?: string | null; homeworkId?: string | null },
): Promise<{ branchId: string; canEdit: boolean }> {
  if (anchor.topicId) {
    const topic = await db.courseTopic.findUnique({
      where: { id: anchor.topicId },
      select: { course: { select: { id: true, branchId: true } } },
    });
    if (!topic) throw AppError.notFound();
    if (!actor.branchIds.includes(topic.course.branchId)) {
      throw AppError.forbidden("errors.branchForbidden");
    }
    return {
      branchId: topic.course.branchId,
      canEdit: await canEditTopicContent(db, actor, topic.course.id),
    };
  }
  if (anchor.homeworkId) {
    const homework = await db.homework.findUnique({
      where: { id: anchor.homeworkId },
      select: { groupId: true },
    });
    if (!homework) throw AppError.notFound();
    const group = await findGroupInScope(db, actor, homework.groupId, {});
    return {
      branchId: group.branchId,
      canEdit:
        actor.permissions.includes("*") || actor.permissions.includes("groups.attendance.mark"),
    };
  }
  throw AppError.validation({ topicId: ["validation.required"] });
}

export async function listExercises(
  actor: Actor,
  anchor: { topicId?: string; homeworkId?: string },
  db: DbClient = prisma,
): Promise<{ items: ExerciseDto[]; canEdit: boolean }> {
  authorize(actor, "groups.view");
  const scope = await anchorInScope(db, actor, anchor);
  const rows = await db.exercise.findMany({
    where: anchor.topicId ? { topicId: anchor.topicId } : { homeworkId: anchor.homeworkId },
    include,
    orderBy: { createdAt: "asc" },
  });
  const items: ExerciseDto[] = [];
  for (const row of rows) items.push(await toDto(db, actor, row));
  return { items, canEdit: scope.canEdit };
}

export async function getExercise(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<ExerciseDto> {
  authorize(actor, "groups.view");
  const row = await db.exercise.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound();
  await anchorInScope(db, actor, row);
  return toDto(db, actor, row);
}

export async function createExercise(
  actor: Actor,
  input: ExerciseInput,
  db: DbClient = prisma,
): Promise<ExerciseDto> {
  authorize(actor, "groups.view");
  // Exactly one anchor: a topic (for the whole course) or one group's homework.
  if (Boolean(input.topicId) === Boolean(input.homeworkId)) {
    throw AppError.validation({ topicId: ["validation.required"] });
  }
  const scope = await anchorInScope(db, actor, input);
  if (!scope.canEdit) throw AppError.forbidden();
  return db.$transaction(async (tx) => {
    const row = await tx.exercise.create({
      data: {
        topicId: input.topicId ?? null,
        homeworkId: input.homeworkId ?? null,
        title: input.title,
        items: input.items as unknown as Prisma.InputJsonValue,
        createdById: actor.userId,
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "exercise.create",
      entity: "Exercise",
      entityId: row.id,
      after: {
        title: row.title,
        items: input.items.length,
        topicId: row.topicId,
        homeworkId: row.homeworkId,
      },
      branchId: scope.branchId,
    });
    return toDto(tx, actor, row);
  });
}

/** Replaces the title and items; earlier attempts keep their scores against the old key. */
export async function updateExercise(
  actor: Actor,
  id: string,
  input: ExerciseBodyInput,
  db: DbClient = prisma,
): Promise<ExerciseDto> {
  authorize(actor, "groups.view");
  const before = await db.exercise.findUnique({ where: { id }, include });
  if (!before) throw AppError.notFound();
  const scope = await anchorInScope(db, actor, before);
  if (!scope.canEdit) throw AppError.forbidden();
  return db.$transaction(async (tx) => {
    const row = await tx.exercise.update({
      where: { id },
      data: { title: input.title, items: input.items as unknown as Prisma.InputJsonValue },
      include,
    });
    await recordAudit(tx, actor, {
      action: "exercise.update",
      entity: "Exercise",
      entityId: id,
      before: { title: before.title, items: parseItems(before.items).length },
      after: { title: row.title, items: input.items.length },
      branchId: scope.branchId,
    });
    return toDto(tx, actor, row);
  });
}

export async function deleteExercise(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.view");
  const row = await db.exercise.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound();
  const scope = await anchorInScope(db, actor, row);
  if (!scope.canEdit) throw AppError.forbidden();
  await db.$transaction(async (tx) => {
    await tx.exercise.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "exercise.delete",
      entity: "Exercise",
      entityId: id,
      before: { title: row.title },
      branchId: scope.branchId,
    });
  });
}

/** Who tried the exercise and how it went, best go per student, within the actor's groups. */
export async function listExerciseResults(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<ExerciseResultRowDto[]> {
  authorize(actor, "groups.view");
  const row = await db.exercise.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound();
  await anchorInScope(db, actor, row);
  const attempts = await db.exerciseAttempt.findMany({
    where: { exerciseId: id, membership: { group: groupScope(actor) } },
    include: {
      membership: {
        select: {
          student: { select: { id: true, fullName: true } },
          group: { select: { name: true } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });
  const byMembership = new Map<string, ExerciseResultRowDto>();
  for (const a of attempts) {
    const current = byMembership.get(a.membershipId);
    const percent = a.maxScore === 0 ? 0 : Math.round((a.score / a.maxScore) * 100);
    if (!current) {
      byMembership.set(a.membershipId, {
        studentId: a.membership.student.id,
        fullName: a.membership.student.fullName,
        groupName: a.membership.group.name,
        attempts: 1,
        bestScore: a.score,
        maxScore: a.maxScore,
        bestPercent: percent,
        lastAt: a.submittedAt.toISOString(),
      });
    } else {
      current.attempts += 1;
      current.lastAt = a.submittedAt.toISOString();
      if (percent > current.bestPercent) {
        current.bestPercent = percent;
        current.bestScore = a.score;
        current.maxScore = a.maxScore;
      }
    }
  }
  return [...byMembership.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/* ----- the student's side ------------------------------------------------------------------ */

function best(
  attempts: Array<{ score: number; maxScore: number }>,
): PortalExerciseSummaryDto["best"] {
  let top: PortalExerciseSummaryDto["best"] = null;
  for (const a of attempts) {
    const percent = a.maxScore === 0 ? 0 : Math.round((a.score / a.maxScore) * 100);
    if (!top || percent > top.percent) top = { score: a.score, maxScore: a.maxScore, percent };
  }
  return top;
}

/** Summaries of the exercises on the given topics or homework for one student. */
export async function portalExerciseSummaries(
  db: DbClient,
  membershipId: string,
  anchor: { topicIds?: string[]; homeworkIds?: string[] },
): Promise<Map<string, PortalExerciseSummaryDto[]>> {
  const where: Prisma.ExerciseWhereInput = anchor.topicIds
    ? { topicId: { in: anchor.topicIds } }
    : { homeworkId: { in: anchor.homeworkIds ?? [] } };
  const rows = await db.exercise.findMany({
    where,
    include: {
      attempts: { where: { membershipId }, select: { score: true, maxScore: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const out = new Map<string, PortalExerciseSummaryDto[]>();
  for (const r of rows) {
    const key = (anchor.topicIds ? r.topicId : r.homeworkId) ?? "";
    const list = out.get(key) ?? [];
    list.push({
      id: r.id,
      title: r.title,
      itemCount: parseItems(r.items).length,
      attempts: r.attempts.length,
      best: best(r.attempts),
    });
    out.set(key, list);
  }
  return out;
}

/** The exercise the student may do: on their group's homework, or on a topic open to their group. */
async function exerciseForMembership(
  db: DbClient,
  membership: { id: string; groupId: string },
  id: string,
) {
  const row = await db.exercise.findUnique({
    where: { id },
    include: {
      homework: { select: { groupId: true } },
      topic: {
        select: {
          id: true,
          course: {
            select: { groups: { where: { id: membership.groupId }, select: { id: true } } },
          },
        },
      },
      attempts: { where: { membershipId: membership.id }, select: { score: true, maxScore: true } },
    },
  });
  if (!row) throw AppError.notFound();
  if (row.homework) {
    if (row.homework.groupId !== membership.groupId) throw AppError.notFound();
    return row;
  }
  if (!row.topic || row.topic.course.groups.length === 0) throw AppError.notFound();
  const [lesson, release] = await Promise.all([
    db.lesson.findFirst({
      where: { groupId: membership.groupId, courseTopicId: row.topic.id },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
    db.groupTopicRelease.findUnique({
      where: { groupId_topicId: { groupId: membership.groupId, topicId: row.topic.id } },
    }),
  ]);
  if (!topicOpen(releaseOf(release), lesson ? dateToIso(lesson.date) : null)) {
    throw AppError.conflict("errors.topicLocked");
  }
  return row;
}

function studentView(items: ExerciseItem[], seed: string): PortalExerciseItem[] {
  return items.map((item, i): PortalExerciseItem => {
    switch (item.kind) {
      case "CHOICE":
        return {
          kind: "CHOICE",
          prompt: item.prompt,
          options: item.options,
          multiple: item.correct.length > 1,
        };
      case "TRUE_FALSE":
        return { kind: "TRUE_FALSE", prompt: item.prompt };
      case "GAP":
        return { kind: "GAP", prompt: item.prompt, gaps: item.answers.length };
      case "MATCH":
        return {
          kind: "MATCH",
          prompt: item.prompt,
          lefts: item.pairs.map((p) => p.left),
          rights: seededShuffle(
            item.pairs.map((p) => p.right),
            `${seed}:${i}`,
          ),
        };
      case "ORDER":
        return {
          kind: "ORDER",
          prompt: item.prompt,
          pieces: seededShuffle(item.items, `${seed}:${i}`),
        };
      case "SHORT":
        return { kind: "SHORT", prompt: item.prompt };
    }
  });
}

/** The answer key of an item, as lines the student can read after a go. */
export function itemKey(item: ExerciseItem): string[] {
  switch (item.kind) {
    case "CHOICE":
      return item.correct.map((i) => item.options[i]!);
    case "TRUE_FALSE":
      return [item.correct ? "true" : "false"];
    case "GAP":
      return item.answers.map((a) => a[0]!);
    case "MATCH":
      return item.pairs.map((p) => `${p.left} — ${p.right}`);
    case "ORDER":
      return item.items;
    case "SHORT":
      return [item.answers[0]!];
  }
}

export async function getPortalExercise(
  token: string,
  id: string,
  db: DbClient = prisma,
): Promise<PortalExerciseDto> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const row = await exerciseForMembership(db, membership, id);
  const items = parseItems(row.items);
  return {
    id: row.id,
    title: row.title,
    itemCount: items.length,
    attempts: row.attempts.length,
    best: best(row.attempts),
    items: studentView(items, `${row.id}:${membership.id}`),
  };
}

/** The student hands in a go: scored at once, kept, and the key shown back. */
export async function submitPortalExercise(
  token: string,
  id: string,
  input: ExerciseAttemptInput,
  db: DbClient = prisma,
): Promise<PortalExerciseResultDto> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const row = await exerciseForMembership(db, membership, id);
  const items = parseItems(row.items);
  const result = scoreExercise(items, input.answers as Record<string, ExerciseAnswer>);
  await db.exerciseAttempt.create({
    data: {
      exerciseId: id,
      membershipId: membership.id,
      answers: input.answers as Prisma.InputJsonValue,
      score: result.score,
      maxScore: result.maxScore,
    },
  });
  const all = [...row.attempts, { score: result.score, maxScore: result.maxScore }];
  return {
    score: result.score,
    maxScore: result.maxScore,
    percent: result.percent,
    items: result.items.map((r, i) => ({ ...r, key: itemKey(items[i]!) })),
    best: best(all)!,
    attempts: all.length,
  };
}

export const EXERCISE_KIND_LIST: readonly ExerciseKind[] = [
  "CHOICE",
  "TRUE_FALSE",
  "GAP",
  "MATCH",
  "ORDER",
  "SHORT",
];
