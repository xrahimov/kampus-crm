import { createHmac } from "node:crypto";

import type { Prisma, VideoPeerRole } from "@/generated/prisma/client";
import { DEFAULT_STUN_URLS } from "@/lib/validation/integrations";
import type { StartVideoInput, VideoLinksSmsInput, VideoSyncInput } from "@/lib/validation/video";
import { recordAudit } from "@/server/audit/audit";
import { generateToken, safeEqual, sha256 } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import { loadIntegrationConfig } from "@/server/services/integrations/integrations.service";
import { deliverMessage } from "@/server/services/sms/sms.service";
import { dateToIso, getOrganizationId, isoToDate } from "@/server/services/settings/shared";

/*
 * Video lessons. Browsers talk to each other directly over WebRTC (a full mesh:
 * every participant sends audio and video to every other one). The server only
 * keeps the room, who is in it, and relays the connection messages (offers,
 * answers, ICE candidates) through the VideoSignal table, which each browser
 * polls about once a second. Staff join with their session; students have no
 * accounts, so each membership gets a personal link (/class/<token>).
 *
 * Who may do what reuses existing permissions: running a lesson's call is the
 * same right as marking its attendance (groups.attendance.mark, in the group's
 * scope); anyone who may open the group (groups.view) may sit in.
 */

/** A browser that has not synced for this long is treated as gone. */
export const PEER_TIMEOUT_MS = 20_000;
/** A LIVE room nobody has been in for this long is closed on the next look. */
export const ROOM_IDLE_MS = 15 * 60_000;
/** Memberships whose students may join the group's calls. */
const JOINABLE = ["NEW", "TRIAL", "ACTIVE"] as const;

export interface IceServerDto {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface VideoRoomDto {
  id: string;
  groupId: string;
  groupName: string;
  lessonId: string | null;
  lessonDate: string | null;
  lessonStart: string | null;
  lessonEnd: string | null;
  status: "LIVE" | "ENDED";
  startedAt: string;
  startedByName: string;
  endedAt: string | null;
  /** People connected right now. */
  online: Array<{ id: string; displayName: string; role: VideoPeerRole }>;
}

export interface GroupVideoDto {
  enabled: boolean;
  room: VideoRoomDto | null;
  /** Today's lesson, offered as the one the call belongs to. */
  todayLesson: { id: string; date: string; startTime: string; endTime: string } | null;
  /** The last call that ended, with the students who came. */
  lastRoom: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    students: Array<{ studentId: string; fullName: string; minutes: number }>;
  } | null;
}

export interface StudentLinkDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  phone: string | null;
  token: string;
}

export interface JoinDto {
  roomId: string;
  participantId: string;
  secret: string;
  displayName: string;
  role: VideoPeerRole;
  groupName: string;
  canEnd: boolean;
  iceServers: IceServerDto[];
  maxParticipants: number;
}

export interface PeerDto {
  id: string;
  displayName: string;
  role: VideoPeerRole;
  joinedAt: string;
  media: { audio: boolean; video: boolean; screen: boolean } | null;
}

export interface SyncDto {
  /** GONE: this browser left, or the same person joined again from another tab. */
  status: "LIVE" | "ENDED" | "GONE";
  peers: PeerDto[];
  signals: Array<{ id: number; from: string; kind: string; payload: unknown }>;
}

export interface ClassPageDto {
  organizationName: string;
  groupName: string;
  studentName: string;
  enabled: boolean;
  /** The group's LIVE room, if the teacher has started one. */
  roomId: string | null;
  schedule: Array<{ weekday: number; startTime: string; endTime: string }>;
}

/* ----- configuration ------------------------------------------------------------------------ */

const splitUrls = (value: string | undefined): string[] =>
  (value ?? "").split(/[\s,]+/).filter(Boolean);

interface VideoConfig {
  enabled: boolean;
  stunUrls: string[];
  turnUrls: string[];
  turnUsername: string;
  turnCredential: string;
  turnSecret: string;
  maxParticipants: number;
}

export async function loadVideoConfig(db: DbClient = prisma): Promise<VideoConfig> {
  const c = await loadIntegrationConfig(db, "VIDEO");
  return {
    enabled: c?.isEnabled ?? true,
    stunUrls: splitUrls(c?.stunUrls ?? DEFAULT_STUN_URLS),
    turnUrls: splitUrls(c?.turnUrls),
    turnUsername: c?.turnUsername ?? "",
    turnCredential: c?.turnCredential ?? "",
    turnSecret: c?.turnSecret ?? "",
    maxParticipants: c?.maxParticipants ?? 12,
  };
}

/**
 * The ICE servers a browser gets. With a TURN shared secret (coturn
 * `use-auth-secret`), the password is an HMAC valid for `ttlSeconds`, so the
 * secret itself never leaves the server.
 */
export function iceServersFor(
  config: Pick<
    VideoConfig,
    "stunUrls" | "turnUrls" | "turnUsername" | "turnCredential" | "turnSecret"
  >,
  peerId: string,
  now = new Date(),
  ttlSeconds = 12 * 3600,
): IceServerDto[] {
  const servers: IceServerDto[] = [];
  if (config.stunUrls.length > 0) servers.push({ urls: config.stunUrls });
  if (config.turnUrls.length > 0) {
    if (config.turnSecret) {
      const username = `${Math.floor(now.getTime() / 1000) + ttlSeconds}:${peerId}`;
      const credential = createHmac("sha1", config.turnSecret).update(username).digest("base64");
      servers.push({ urls: config.turnUrls, username, credential });
    } else if (config.turnUsername) {
      servers.push({
        urls: config.turnUrls,
        username: config.turnUsername,
        credential: config.turnCredential,
      });
    } else {
      servers.push({ urls: config.turnUrls });
    }
  }
  return servers;
}

/* ----- rooms -------------------------------------------------------------------------------- */

const roomInclude = {
  group: { select: { name: true } },
  lesson: { select: { date: true, startTime: true, endTime: true } },
  startedBy: { select: { fullName: true } },
} satisfies Prisma.VideoRoomInclude;

type RoomRow = Prisma.VideoRoomGetPayload<{ include: typeof roomInclude }>;

async function onlinePeers(db: DbClient, roomId: string, now = new Date()) {
  return db.videoParticipant.findMany({
    where: { roomId, leftAt: null, lastSeenAt: { gte: new Date(now.getTime() - PEER_TIMEOUT_MS) } },
    orderBy: { joinedAt: "asc" },
  });
}

async function toRoomDto(db: DbClient, row: RoomRow): Promise<VideoRoomDto> {
  const online = row.status === "LIVE" ? await onlinePeers(db, row.id) : [];
  return {
    id: row.id,
    groupId: row.groupId,
    groupName: row.group.name,
    lessonId: row.lessonId,
    lessonDate: row.lesson ? dateToIso(row.lesson.date) : null,
    lessonStart: row.lesson?.startTime ?? null,
    lessonEnd: row.lesson?.endTime ?? null,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    startedByName: row.startedBy.fullName,
    endedAt: row.endedAt?.toISOString() ?? null,
    online: online.map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
  };
}

async function closeRoom(db: DbClient, roomId: string, at = new Date()): Promise<void> {
  await db.videoRoom.updateMany({
    where: { id: roomId, status: "LIVE" },
    data: { status: "ENDED", endedAt: at },
  });
  await db.videoParticipant.updateMany({ where: { roomId, leftAt: null }, data: { leftAt: at } });
  await db.videoSignal.deleteMany({ where: { roomId } });
}

/** The group's LIVE room; one left empty for ROOM_IDLE_MS is closed instead. */
async function findLiveRoom(db: DbClient, groupId: string, now = new Date()) {
  const room = await db.videoRoom.findFirst({
    where: { groupId, status: "LIVE" },
    include: roomInclude,
    orderBy: { startedAt: "desc" },
  });
  if (!room) return null;
  const idleSince = new Date(now.getTime() - ROOM_IDLE_MS);
  if (room.startedAt < idleSince) {
    const recent = await db.videoParticipant.count({
      where: { roomId: room.id, lastSeenAt: { gte: idleSince } },
    });
    if (recent === 0) {
      await closeRoom(db, room.id, now);
      return null;
    }
  }
  return room;
}

async function lastEndedRoom(db: DbClient, groupId: string): Promise<GroupVideoDto["lastRoom"]> {
  const room = await db.videoRoom.findFirst({
    where: { groupId, status: "ENDED" },
    orderBy: { startedAt: "desc" },
    include: {
      participants: {
        where: { role: "STUDENT", studentId: { not: null } },
        include: { student: { select: { fullName: true } } },
      },
    },
  });
  if (!room) return null;
  const minutes = new Map<string, { fullName: string; ms: number }>();
  for (const p of room.participants) {
    if (!p.studentId || !p.student) continue;
    const end = (p.leftAt ?? p.lastSeenAt).getTime();
    const entry = minutes.get(p.studentId) ?? { fullName: p.student.fullName, ms: 0 };
    entry.ms += Math.max(0, end - p.joinedAt.getTime());
    minutes.set(p.studentId, entry);
  }
  return {
    id: room.id,
    startedAt: room.startedAt.toISOString(),
    endedAt: room.endedAt?.toISOString() ?? null,
    students: [...minutes.entries()]
      .map(([studentId, v]) => ({
        studentId,
        fullName: v.fullName,
        minutes: Math.round(v.ms / 60_000),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

/** The "Video lesson" card on the group page. */
export async function getGroupVideo(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupVideoDto> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const [config, live, lesson, lastRoom] = await Promise.all([
    loadVideoConfig(db),
    findLiveRoom(db, groupId),
    db.lesson.findFirst({
      where: { groupId, date: isoToDate(today()) },
      orderBy: { startTime: "asc" },
    }),
    lastEndedRoom(db, groupId),
  ]);
  return {
    enabled: config.enabled,
    room: live ? await toRoomDto(db, live) : null,
    todayLesson: lesson
      ? {
          id: lesson.id,
          date: dateToIso(lesson.date),
          startTime: lesson.startTime,
          endTime: lesson.endTime,
        }
      : null,
    lastRoom,
  };
}

/** Opens the group's call (or returns the one already open). */
export async function startVideoRoom(
  actor: Actor,
  groupId: string,
  input: StartVideoInput,
  db: DbClient = prisma,
): Promise<VideoRoomDto> {
  authorize(actor, "groups.attendance.mark");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const config = await loadVideoConfig(db);
  if (!config.enabled) throw AppError.conflict("errors.videoDisabled");

  let lessonId = input.lessonId ?? null;
  if (lessonId) {
    const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson || lesson.groupId !== groupId) {
      throw AppError.validation({ lessonId: ["validation.lessonUnknown"] });
    }
  } else if (input.lessonId === undefined) {
    const lesson = await db.lesson.findFirst({
      where: { groupId, date: isoToDate(today()) },
      orderBy: { startTime: "asc" },
    });
    lessonId = lesson?.id ?? null;
  }

  const row = await db.$transaction(async (tx) => {
    // Serialises concurrent starts of the same group: one LIVE room per group.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`video:${groupId}`}))`;
    const existing = await findLiveRoom(tx, groupId);
    if (existing) return existing;
    const created = await tx.videoRoom.create({
      data: { groupId, lessonId, startedById: actor.userId },
      include: roomInclude,
    });
    await recordAudit(tx, actor, {
      action: "video.start",
      entity: "VideoRoom",
      entityId: created.id,
      after: { groupId, lessonId },
      branchId: group.branchId,
    });
    return created;
  });
  return toRoomDto(db, row);
}

async function findRoomInScope(db: DbClient, actor: Actor, roomId: string) {
  const room = await db.videoRoom.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) throw AppError.notFound();
  const group = await findGroupInScope(db, actor, room.groupId, {});
  return { room, group };
}

export async function getVideoRoom(
  actor: Actor,
  roomId: string,
  db: DbClient = prisma,
): Promise<VideoRoomDto> {
  authorize(actor, "groups.view");
  const { room } = await findRoomInScope(db, actor, roomId);
  return toRoomDto(db, room);
}

/** Ends the call for everyone; the browsers notice on their next sync. */
export async function endVideoRoom(
  actor: Actor,
  roomId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const { room, group } = await findRoomInScope(db, actor, roomId);
  if (room.status === "ENDED") return;
  await db.$transaction(async (tx) => {
    await closeRoom(tx, roomId);
    await recordAudit(tx, actor, {
      action: "video.end",
      entity: "VideoRoom",
      entityId: roomId,
      before: { groupId: room.groupId, startedAt: room.startedAt.toISOString() },
      branchId: group.branchId,
    });
  });
}

/* ----- joining ------------------------------------------------------------------------------ */

async function addParticipant(
  db: DbClient,
  config: VideoConfig,
  room: { id: string; groupName: string },
  who: { role: VideoPeerRole; displayName: string; userId?: string; studentId?: string },
  canEnd: boolean,
): Promise<JoinDto> {
  const online = await onlinePeers(db, room.id);
  // A reload or a second tab replaces the person's earlier browser instead of counting twice.
  const same = online.filter(
    (p) =>
      (who.userId && p.userId === who.userId) || (who.studentId && p.studentId === who.studentId),
  );
  if (online.length - same.length >= config.maxParticipants) {
    throw AppError.conflict("errors.videoFull");
  }
  const secret = generateToken();
  const now = new Date();
  if (same.length > 0) {
    await db.videoParticipant.updateMany({
      where: { id: { in: same.map((p) => p.id) } },
      data: { leftAt: now },
    });
  }
  const participant = await db.videoParticipant.create({
    data: {
      roomId: room.id,
      role: who.role,
      userId: who.userId ?? null,
      studentId: who.studentId ?? null,
      displayName: who.displayName,
      secretHash: sha256(secret),
    },
  });
  return {
    roomId: room.id,
    participantId: participant.id,
    secret,
    displayName: who.displayName,
    role: who.role,
    groupName: room.groupName,
    canEnd,
    iceServers: iceServersFor(config, participant.id, now),
    maxParticipants: config.maxParticipants,
  };
}

/** A staff member enters the call: the group's teachers as hosts, anyone else in scope as a guest. */
export async function joinVideoRoomAsStaff(
  actor: Actor,
  roomId: string,
  db: DbClient = prisma,
): Promise<JoinDto> {
  authorize(actor, "groups.view");
  const { room } = await findRoomInScope(db, actor, roomId);
  if (room.status !== "LIVE") throw AppError.conflict("errors.videoEnded");
  const config = await loadVideoConfig(db);
  if (!config.enabled) throw AppError.conflict("errors.videoDisabled");
  const teaches = await db.group.count({
    where: {
      id: room.groupId,
      OR: [
        { teachers: { some: { userId: actor.userId } } },
        { supportTeachers: { some: { userId: actor.userId } } },
      ],
    },
  });
  const host = teaches > 0 || room.startedById === actor.userId;
  return addParticipant(
    db,
    config,
    { id: room.id, groupName: room.group.name },
    { role: host ? "HOST" : "STAFF", displayName: actor.fullName, userId: actor.userId },
    can(actor, "groups.attendance.mark"),
  );
}

async function membershipByToken(db: DbClient, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const membership = await db.groupMembership.findUnique({
    where: { videoToken: token },
    include: {
      student: { select: { id: true, fullName: true, isArchived: true } },
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          slots: { select: { weekday: true, startTime: true, endTime: true } },
        },
      },
    },
  });
  if (
    !membership ||
    membership.student.isArchived ||
    membership.group.status === "ARCHIVED" ||
    !(JOINABLE as readonly string[]).includes(membership.status)
  ) {
    return null;
  }
  return membership;
}

/** What a student's personal link shows: whose link it is and whether class is on. */
export async function getClassPage(
  token: string,
  db: DbClient = prisma,
): Promise<ClassPageDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const [config, live, org] = await Promise.all([
    loadVideoConfig(db),
    findLiveRoom(db, membership.groupId),
    db.organization.findFirst({ select: { name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    organizationName: org?.name ?? "",
    groupName: membership.group.name,
    studentName: membership.student.fullName,
    enabled: config.enabled,
    roomId: config.enabled ? (live?.id ?? null) : null,
    schedule: membership.group.slots
      .map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime }))
      .sort((a, b) => a.weekday - b.weekday),
  };
}

/** A student enters the group's LIVE call through their personal link. */
export async function joinVideoRoomAsStudent(
  token: string,
  db: DbClient = prisma,
): Promise<JoinDto> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const config = await loadVideoConfig(db);
  if (!config.enabled) throw AppError.conflict("errors.videoDisabled");
  const live = await findLiveRoom(db, membership.groupId);
  if (!live) throw AppError.conflict("errors.videoNotStarted");
  return addParticipant(
    db,
    config,
    { id: live.id, groupName: membership.group.name },
    {
      role: "STUDENT",
      displayName: membership.student.fullName,
      studentId: membership.student.id,
    },
    false,
  );
}

/* ----- signalling --------------------------------------------------------------------------- */

/**
 * One poll from a browser: proves it owns `participantId`, refreshes its
 * heartbeat, stores its outgoing messages, drops the ones it has acknowledged
 * (`after`) and returns the newer ones plus who else is in the room.
 */
export async function syncVideoPeer(
  participantId: string,
  input: VideoSyncInput,
  db: DbClient = prisma,
): Promise<SyncDto> {
  const me = await db.videoParticipant.findUnique({
    where: { id: participantId },
    include: { room: { select: { id: true, status: true } } },
  });
  if (!me || !safeEqual(sha256(input.secret), me.secretHash)) throw AppError.forbidden();
  if (me.room.status !== "LIVE") return { status: "ENDED", peers: [], signals: [] };
  // Left already, or replaced by the same person's newer tab.
  if (me.leftAt) return { status: "GONE", peers: [], signals: [] };
  const now = new Date();
  await db.videoParticipant.update({
    where: { id: me.id },
    data: {
      lastSeenAt: now,
      ...(input.leave ? { leftAt: now } : {}),
      ...(input.state ? { media: input.state } : {}),
    },
  });
  if (input.leave) {
    await db.videoSignal.deleteMany({
      where: { roomId: me.roomId, OR: [{ toId: me.id }, { fromId: me.id }] },
    });
    return { status: "GONE", peers: [], signals: [] };
  }

  const peers = (await onlinePeers(db, me.roomId, now)).filter((p) => p.id !== me.id);
  const peerIds = new Set(peers.map((p) => p.id));
  const outgoing = input.signals.filter((s) => peerIds.has(s.to));
  if (outgoing.length > 0) {
    await db.videoSignal.createMany({
      data: outgoing.map((s) => ({
        roomId: me.roomId,
        fromId: me.id,
        toId: s.to,
        kind: s.kind,
        payload: (s.payload ?? null) as Prisma.InputJsonValue,
      })),
    });
  }
  if (input.after > 0) {
    await db.videoSignal.deleteMany({ where: { toId: me.id, id: { lte: input.after } } });
  }
  const incoming = await db.videoSignal.findMany({
    where: { toId: me.id, id: { gt: input.after } },
    orderBy: { id: "asc" },
    take: 200,
  });
  return {
    status: "LIVE",
    peers: peers.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      joinedAt: p.joinedAt.toISOString(),
      media: (p.media as PeerDto["media"]) ?? null,
    })),
    signals: incoming.map((s) => ({ id: s.id, from: s.fromId, kind: s.kind, payload: s.payload })),
  };
}

/* ----- student links ------------------------------------------------------------------------ */

async function ensureTokens(db: DbClient, groupId: string) {
  const members = await db.groupMembership.findMany({
    where: { groupId, status: { in: [...JOINABLE] }, student: { isArchived: false } },
    include: { student: { select: { id: true, fullName: true, phone: true } } },
    orderBy: { student: { fullName: "asc" } },
  });
  for (const m of members) {
    if (m.videoToken) continue;
    m.videoToken = generateToken(18);
    await db.groupMembership.update({ where: { id: m.id }, data: { videoToken: m.videoToken } });
  }
  return members;
}

/** Each current student's personal link token (created on first use). */
export async function listStudentLinks(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<StudentLinkDto[]> {
  authorize(actor, "groups.attendance.mark");
  await findGroupInScope(db, actor, groupId, {});
  const members = await ensureTokens(db, groupId);
  return members.map((m) => ({
    membershipId: m.id,
    studentId: m.student.id,
    fullName: m.student.fullName,
    phone: m.student.phone,
    token: m.videoToken!,
  }));
}

/** Replaces a student's link, e.g. after it was shared with someone else. */
export async function resetStudentLink(
  actor: Actor,
  membershipId: string,
  db: DbClient = prisma,
): Promise<StudentLinkDto> {
  authorize(actor, "groups.attendance.mark");
  const membership = await db.groupMembership.findUnique({
    where: { id: membershipId },
    include: { student: { select: { id: true, fullName: true, phone: true } } },
  });
  if (!membership) throw AppError.notFound();
  const group = await findGroupInScope(db, actor, membership.groupId, {});
  const token = generateToken(18);
  await db.$transaction(async (tx) => {
    await tx.groupMembership.update({ where: { id: membershipId }, data: { videoToken: token } });
    await recordAudit(tx, actor, {
      action: "video.resetLink",
      entity: "GroupMembership",
      entityId: membershipId,
      branchId: group.branchId,
    });
  });
  return {
    membershipId,
    studentId: membership.student.id,
    fullName: membership.student.fullName,
    phone: membership.student.phone,
    token,
  };
}

export function classLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/class/${token}`;
}

/** Texts every current student with a phone their own link. */
export async function smsStudentLinks(
  actor: Actor,
  groupId: string,
  input: VideoLinksSmsInput,
  origin = process.env.APP_URL ?? "http://localhost:3000",
  db: DbClient = prisma,
): Promise<{ total: number; sent: number; failed: number; skipped: number }> {
  authorize(actor, "sms.send");
  authorize(actor, "groups.attendance.mark");
  const group = await findGroupInScope(db, actor, groupId, {});
  const members = await ensureTokens(db, groupId);
  const withPhone = members.filter((m) => m.student.phone);
  if (withPhone.length === 0) throw AppError.validation({ text: ["validation.noRecipients"] });
  const organizationId = await getOrganizationId(db);
  const ids = await db.$transaction(async (tx) => {
    const created: string[] = [];
    for (const m of withPhone) {
      const text = input.text
        .replaceAll("{link}", classLink(origin, m.videoToken!))
        .replaceAll("{studentName}", m.student.fullName);
      const row = await tx.smsMessage.create({
        data: {
          organizationId,
          branchId: group.branchId,
          recipientType: "STUDENT",
          recipientName: m.student.fullName,
          phone: m.student.phone!,
          studentId: m.student.id,
          text,
          status: "QUEUED",
          sentById: actor.userId || null,
        },
      });
      created.push(row.id);
    }
    await recordAudit(tx, actor, {
      action: "video.smsLinks",
      entity: "SmsMessage",
      entityId: created[0] ?? "",
      after: { groupId, recipients: created.length },
      branchId: group.branchId,
    });
    return created;
  });
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    if ((await deliverMessage(db, id)) === "SENT") sent += 1;
    else failed += 1;
  }
  return { total: ids.length, sent, failed, skipped: members.length - withPhone.length };
}
