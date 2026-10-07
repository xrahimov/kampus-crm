import type { MaterialKind, Prisma } from "@/generated/prisma/client";
import type { MaterialInput } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, ownGroupsOnly, today } from "@/server/services/groups/shared";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { notifyMaterial } from "@/server/services/telegram/student-telegram.service";
import { loadVideoConfig, membershipByToken } from "@/server/services/video/video.service";
import { getStorage, newStorageKey } from "@/server/storage/local";

/*
 * Lesson materials (A-105): files, links and call recordings students open
 * from their personal link. A material belongs to a group and, when one fits,
 * to a lesson. Adding and removing them is the attendance right of the group
 * (groups.attendance.mark); reading needs groups.view.
 */

/** Lessons offered when adding a material: this many days ahead at most. */
const PICKABLE_DAYS_AHEAD = 14;
/** A recording of a whole lesson at the browser's modest bitrate stays well under this. */
export const RECORDING_MAX_BYTES = 400 * 1024 * 1024;
const RECORDING_TYPES = ["video/webm", "video/mp4"] as const;

export interface MaterialDto {
  id: string;
  lessonId: string | null;
  lessonDate: string | null;
  lessonTopic: string | null;
  kind: MaterialKind;
  title: string;
  url: string;
  size: number | null;
  durationSec: number | null;
  createdByName: string | null;
  createdAt: string;
}

export interface GroupMaterialsDto {
  items: MaterialDto[];
  /** Lessons a material can be tied to: past ones and the next two weeks, newest first. */
  lessons: Array<{ id: string; date: string; topic: string | null }>;
}

const include = {
  lesson: { select: { date: true, topic: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.LessonMaterialInclude;
type Row = Prisma.LessonMaterialGetPayload<{ include: typeof include }>;

function toDto(row: Row): MaterialDto {
  return {
    id: row.id,
    lessonId: row.lessonId,
    lessonDate: row.lesson ? dateToIso(row.lesson.date) : null,
    lessonTopic: row.lesson?.topic ?? null,
    kind: row.kind,
    title: row.title,
    url: row.url,
    size: row.size,
    durationSec: row.durationSec,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Newest lesson first, materials for the whole group (no lesson) at the end, newest first within. */
function sorted(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const da = a.lesson?.date.getTime() ?? -Infinity;
    const dbb = b.lesson?.date.getTime() ?? -Infinity;
    if (da !== dbb) return dbb - da;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

async function groupInScope(db: DbClient, actor: Actor, groupId: string) {
  const group = await findGroupInScope(db, actor, groupId, {});
  return group as typeof group & { branchId: string; name: string; status: string };
}

/** Group → MATERIALLAR tab. */
export async function listGroupMaterials(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupMaterialsDto> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const horizon = isoToDate(today());
  horizon.setUTCDate(horizon.getUTCDate() + PICKABLE_DAYS_AHEAD);
  const [rows, lessons] = await Promise.all([
    db.lessonMaterial.findMany({ where: { groupId }, include }),
    db.lesson.findMany({
      where: { groupId, date: { lte: horizon } },
      select: { id: true, date: true, topic: true },
      orderBy: [{ date: "desc" }, { startTime: "desc" }],
      take: 80,
    }),
  ]);
  return {
    items: sorted(rows).map(toDto),
    lessons: lessons.map((l) => ({ id: l.id, date: dateToIso(l.date), topic: l.topic })),
  };
}

/** A teacher adds a file (uploaded beforehand) or a link. */
export async function addMaterial(
  actor: Actor,
  groupId: string,
  input: MaterialInput,
  db: DbClient = prisma,
): Promise<MaterialDto> {
  authorize(actor, "groups.attendance.mark");
  const group = await groupInScope(db, actor, groupId);
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  if (input.lessonId) {
    const lesson = await db.lesson.findFirst({ where: { id: input.lessonId, groupId } });
    if (!lesson) throw AppError.validation({ lessonId: ["validation.required"] });
  }
  return db.$transaction(async (tx) => {
    const row = await tx.lessonMaterial.create({
      data: {
        groupId,
        lessonId: input.lessonId,
        kind: input.kind,
        title: input.title,
        url: input.url,
        createdById: actor.userId,
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "material.add",
      entity: "LessonMaterial",
      entityId: row.id,
      after: {
        kind: row.kind,
        title: row.title,
        lessonDate: row.lesson ? dateToIso(row.lesson.date) : null,
      },
      branchId: group.branchId,
    });
    await notifyMaterial(tx, {
      materialId: row.id,
      groupId,
      groupName: group.name,
      kind: row.kind,
      title: row.title,
    });
    return toDto(row);
  });
}

export async function deleteMaterial(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const row = await mustFind(db.lessonMaterial.findUnique({ where: { id }, include }));
  const group = await groupInScope(db, actor, row.groupId);
  await db.$transaction(async (tx) => {
    await tx.lessonMaterial.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "material.delete",
      entity: "LessonMaterial",
      entityId: id,
      before: { kind: row.kind, title: row.title },
      branchId: group.branchId,
    });
  });
  // A recording exists for this one material only; uploaded files may be shared, so they stay.
  if (row.kind === "RECORDING" && row.url.startsWith("/api/v1/files/")) {
    await getStorage()
      .delete(row.url.slice("/api/v1/files/".length))
      .catch(() => undefined);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly clean-up: recordings older than Settings → Integrations → Video
 * lessons → "Keep lesson recordings for" are deleted with their file, so the
 * server's disk does not fill up. 0 days keeps them forever. Returns how many
 * were removed.
 */
export async function purgeOldRecordings(
  db: DbClient = prisma,
  now: Date = new Date(),
): Promise<number> {
  const { recordingKeepDays } = await loadVideoConfig(db);
  if (recordingKeepDays <= 0) return 0;
  const rows = await db.lessonMaterial.findMany({
    where: {
      kind: "RECORDING",
      createdAt: { lt: new Date(now.getTime() - recordingKeepDays * DAY_MS) },
    },
    include: { group: { select: { branchId: true } } },
  });
  for (const row of rows) {
    await db.$transaction(async (tx) => {
      await tx.lessonMaterial.delete({ where: { id: row.id } });
      await recordAudit(tx, null, {
        action: "material.delete",
        entity: "LessonMaterial",
        entityId: row.id,
        before: { kind: row.kind, title: row.title, keepDays: recordingKeepDays },
        branchId: row.group.branchId,
      });
    });
    if (row.url.startsWith("/api/v1/files/")) {
      await getStorage()
        .delete(row.url.slice("/api/v1/files/".length))
        .catch(() => undefined);
    }
  }
  return rows.length;
}

/**
 * The teacher's browser uploads the recording it made of a call. The body is
 * the raw video; it is streamed to storage and tied to the call's lesson.
 */
export async function saveRecording(
  actor: Actor,
  roomId: string,
  input: { contentType: string; body: ReadableStream<Uint8Array> | null; durationSec: number },
  db: DbClient = prisma,
): Promise<MaterialDto> {
  authorize(actor, "groups.attendance.mark");
  const room = await mustFind(
    db.videoRoom.findUnique({
      where: { id: roomId },
      include: {
        group: { select: { id: true, branchId: true, name: true } },
        lesson: { select: { id: true, date: true } },
      },
    }),
  );
  if (!actor.branchIds.includes(room.group.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (ownGroupsOnly(actor)) await findGroupInScope(db, actor, room.groupId, {});
  const contentType = input.contentType.split(";")[0]!.trim().toLowerCase();
  if (!(RECORDING_TYPES as readonly string[]).includes(contentType)) {
    throw AppError.validation({ file: ["validation.attachmentType"] });
  }
  if (!input.body) throw AppError.validation({ file: ["validation.fileRequired"] });
  const key = newStorageKey("recordings", contentType);
  let stored;
  try {
    stored = await getStorage().putStream(key, input.body, contentType, RECORDING_MAX_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "TOO_LARGE") {
      throw AppError.validation({ file: ["validation.recordingSize"] });
    }
    throw error;
  }
  if (stored.size === 0) throw AppError.validation({ file: ["validation.fileRequired"] });
  const date = room.lesson ? dateToIso(room.lesson.date) : dateToIso(room.startedAt);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tashkent",
  }).format(room.startedAt);
  return db.$transaction(async (tx) => {
    const row = await tx.lessonMaterial.create({
      data: {
        groupId: room.groupId,
        lessonId: room.lesson?.id ?? null,
        kind: "RECORDING",
        title: `${room.group.name} · ${date} ${time}`,
        url: `/api/v1/files/${stored.key}`,
        size: stored.size,
        durationSec: Math.max(0, Math.round(input.durationSec)),
        createdById: actor.userId,
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "material.add",
      entity: "LessonMaterial",
      entityId: row.id,
      after: { kind: row.kind, title: row.title, size: row.size, durationSec: row.durationSec },
      branchId: room.group.branchId,
    });
    await notifyMaterial(tx, {
      materialId: row.id,
      groupId: room.groupId,
      groupName: room.group.name,
      kind: row.kind,
      title: row.title,
    });
    return toDto(row);
  });
}

/* ----- the student's side ------------------------------------------------------------------- */

function portalUrl(token: string, url: string): string {
  if (!url.startsWith("/api/v1/files/")) return url;
  return `/api/v1/public/class/${encodeURIComponent(token)}/files/${url.slice("/api/v1/files/".length)}`;
}

export async function listPortalMaterials(
  token: string,
  db: DbClient = prisma,
): Promise<MaterialDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rows = await db.lessonMaterial.findMany({
    where: { groupId: membership.groupId },
    include,
  });
  return sorted(rows).map((r) => ({
    ...toDto(r),
    url: portalUrl(token, r.url),
    createdByName: null,
  }));
}
