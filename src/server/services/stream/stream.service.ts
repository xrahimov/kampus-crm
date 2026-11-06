import type { StreamCommentInput, StreamPostInput } from "@/lib/validation/stream";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope } from "@/server/services/groups/shared";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";

/**
 * Class stream (A-164, online-lessons item C9): the group's wall. Teachers and
 * the office post; students comment from their page. Pinned posts stay on top,
 * a locked post takes no more comments, and a new post reaches the group's
 * Telegram chats.
 */

export interface StreamCommentDto {
  id: string;
  body: string;
  author: string;
  byStaff: boolean;
  /** The reader's own comment (a student on their page). */
  mine: boolean;
  createdAt: string;
}

export interface StreamPostDto {
  id: string;
  body: string;
  attachmentUrl: string | null;
  pinned: boolean;
  locked: boolean;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  comments: StreamCommentDto[];
}

const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;
const include = {
  author: { select: { fullName: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: {
      author: { select: { fullName: true } },
      membership: { select: { id: true, student: { select: { fullName: true } } } },
    },
  },
};

type Row = NonNullable<Awaited<ReturnType<typeof loadPost>>>;

async function loadPost(db: DbClient, id: string) {
  return db.streamPost.findUnique({ where: { id }, include });
}

function toDto(row: Row, mineMembershipId: string | null): StreamPostDto {
  return {
    id: row.id,
    body: row.body,
    attachmentUrl: row.attachmentUrl,
    pinned: row.pinned,
    locked: row.locked,
    author: row.author?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    comments: row.comments.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author?.fullName ?? c.membership?.student.fullName ?? "—",
      byStaff: c.authorId !== null,
      mine: mineMembershipId !== null && c.membershipId === mineMembershipId,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

async function listFor(
  db: DbClient,
  groupId: string,
  mine: string | null,
): Promise<StreamPostDto[]> {
  const rows = await db.streamPost.findMany({
    where: { groupId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 50,
    include,
  });
  return rows.map((r) => toDto(r, mine));
}

/** A post the actor may touch: its group is in scope and not archived. */
async function findPostInScope(db: DbClient, actor: Actor, id: string) {
  const row = await db.streamPost.findFirst({
    where: { id, group: groupScope(actor) },
    include: {
      ...include,
      group: { select: { id: true, name: true, branchId: true, status: true } },
    },
  });
  if (!row) throw AppError.notFound();
  return row;
}

/* ----- staff ------------------------------------------------------------------------------ */

/** Group → Stream tab. */
export async function listGroupStream(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<StreamPostDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  return listFor(db, groupId, null);
}

export async function createPost(
  actor: Actor,
  groupId: string,
  input: StreamPostInput,
  db: DbClient = prisma,
): Promise<StreamPostDto> {
  authorize(actor, "groups.attendance.mark");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const id = await db.$transaction(async (tx) => {
    const row = await tx.streamPost.create({
      data: {
        groupId,
        authorId: actor.userId,
        body: input.body,
        attachmentUrl: input.attachmentUrl ?? null,
        pinned: input.pinned ?? false,
        locked: input.locked ?? false,
      },
      select: { id: true },
    });
    await recordAudit(tx, actor, {
      action: "stream.post",
      entity: "Group",
      entityId: groupId,
      after: { postId: row.id, body: input.body.slice(0, 200) },
    });
    const students = await tx.groupMembership.findMany({
      where: { groupId, status: { in: [...CURRENT] } },
      select: { studentId: true },
    });
    await notifyStudents(tx, {
      studentIds: students.map((s) => s.studentId),
      kind: "streamPost",
      refKey: `stream:${row.id}`,
      values: { group: group.name, author: actor.fullName, text: input.body.slice(0, 300) },
    });
    return row.id;
  });
  return toDto((await loadPost(db, id))!, null);
}

/** Edits the text, pins or locks a post. */
export async function updatePost(
  actor: Actor,
  id: string,
  input: StreamPostInput,
  db: DbClient = prisma,
): Promise<StreamPostDto> {
  authorize(actor, "groups.attendance.mark");
  const row = await findPostInScope(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.streamPost.update({
      where: { id },
      data: {
        body: input.body,
        ...(input.attachmentUrl !== undefined ? { attachmentUrl: input.attachmentUrl } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.locked !== undefined ? { locked: input.locked } : {}),
      },
    });
    await recordAudit(tx, actor, {
      action: "stream.update",
      entity: "Group",
      entityId: row.groupId,
      before: { body: row.body, pinned: row.pinned, locked: row.locked },
      after: {
        body: input.body,
        pinned: input.pinned ?? row.pinned,
        locked: input.locked ?? row.locked,
      },
    });
  });
  return toDto((await loadPost(db, id))!, null);
}

export async function deletePost(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const row = await findPostInScope(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.streamPost.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "stream.delete",
      entity: "Group",
      entityId: row.groupId,
      before: { body: row.body.slice(0, 200), comments: row.comments.length },
    });
  });
}

export async function addStaffComment(
  actor: Actor,
  postId: string,
  input: StreamCommentInput,
  db: DbClient = prisma,
): Promise<StreamPostDto> {
  authorize(actor, "groups.attendance.mark");
  await findPostInScope(db, actor, postId);
  await db.streamComment.create({ data: { postId, authorId: actor.userId, body: input.body } });
  return toDto((await loadPost(db, postId))!, null);
}

/** Staff remove any comment under a post of their groups. */
export async function deleteComment(
  actor: Actor,
  commentId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const row = await db.streamComment.findFirst({
    where: { id: commentId, post: { group: groupScope(actor) } },
    select: { id: true, postId: true, body: true },
  });
  if (!row) throw AppError.notFound();
  await db.$transaction(async (tx) => {
    await tx.streamComment.delete({ where: { id: commentId } });
    await recordAudit(tx, actor, {
      action: "stream.deleteComment",
      entity: "StreamPost",
      entityId: row.postId,
      before: { body: row.body.slice(0, 200) },
    });
  });
}

/* ----- the student's page ----------------------------------------------------------------- */

export async function listPortalStream(
  token: string,
  db: DbClient = prisma,
): Promise<StreamPostDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  return listFor(db, membership.group.id, membership.id);
}

export async function addPortalComment(
  token: string,
  postId: string,
  input: StreamCommentInput,
  db: DbClient = prisma,
): Promise<StreamPostDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const post = await db.streamPost.findFirst({
    where: { id: postId, groupId: membership.group.id },
    select: { locked: true },
  });
  if (!post) throw AppError.notFound();
  if (post.locked) throw AppError.conflict("errors.streamLocked");
  await db.streamComment.create({
    data: { postId, membershipId: membership.id, body: input.body },
  });
  return toDto((await loadPost(db, postId))!, membership.id);
}

/** A student takes back their own comment. */
export async function deletePortalComment(
  token: string,
  commentId: string,
  db: DbClient = prisma,
): Promise<StreamPostDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const row = await db.streamComment.findFirst({
    where: { id: commentId, membershipId: membership.id },
    select: { postId: true },
  });
  if (!row) throw AppError.notFound();
  await db.streamComment.delete({ where: { id: commentId } });
  return toDto((await loadPost(db, row.postId))!, membership.id);
}
