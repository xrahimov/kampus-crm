import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { centreToday, findGroupInScope } from "@/server/services/groups/shared";
import { notifyMaterial } from "@/server/services/telegram/student-telegram.service";
import { getStorage, newStorageKey } from "@/server/storage/local";

/*
 * Saving the call's whiteboard (A-155): the teacher's browser renders the
 * strokes to a PNG and uploads it; it is filed as a lesson material (kind FILE)
 * under the call's lesson, so students find it on their page like a recording.
 */

export const BOARD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export async function saveBoardImage(
  actor: Actor,
  roomId: string,
  input: { contentType: string; body: ReadableStream<Uint8Array> | null },
  db: DbClient = prisma,
): Promise<{ id: string; title: string; url: string }> {
  authorize(actor, "groups.attendance.mark");
  const room = await db.videoRoom.findUnique({
    where: { id: roomId },
    include: {
      group: { select: { id: true, branchId: true, name: true } },
      lesson: { select: { id: true, date: true } },
    },
  });
  if (!room) throw AppError.notFound();
  await findGroupInScope(db, actor, room.groupId, {});
  const contentType = input.contentType.split(";")[0]!.trim().toLowerCase();
  if (contentType !== "image/png")
    throw AppError.validation({ file: ["validation.attachmentType"] });
  if (!input.body) throw AppError.validation({ file: ["validation.fileRequired"] });
  const key = newStorageKey("boards", contentType);
  let stored;
  try {
    stored = await getStorage().putStream(key, input.body, contentType, BOARD_IMAGE_MAX_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_LARGE") {
      throw AppError.validation({ file: ["validation.attachmentSize"] });
    }
    throw error;
  }
  if (stored.size === 0) throw AppError.validation({ file: ["validation.fileRequired"] });
  // The day and the time of saving, both on the centre's clock.
  const now = new Date();
  const date = centreToday(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(now);
  return db.$transaction(async (tx) => {
    const row = await tx.lessonMaterial.create({
      data: {
        groupId: room.groupId,
        lessonId: room.lesson?.id ?? null,
        kind: "FILE",
        title: `Whiteboard · ${date} ${time}`,
        url: `/api/v1/files/${stored.key}`,
        size: stored.size,
        createdById: actor.userId,
      },
    });
    await recordAudit(tx, actor, {
      action: "material.add",
      entity: "LessonMaterial",
      entityId: row.id,
      after: { kind: row.kind, title: row.title, size: row.size },
      branchId: room.group.branchId,
    });
    await notifyMaterial(tx, {
      materialId: row.id,
      groupId: room.groupId,
      groupName: room.group.name,
      kind: row.kind,
      title: row.title,
    });
    return { id: row.id, title: row.title, url: row.url };
  });
}
