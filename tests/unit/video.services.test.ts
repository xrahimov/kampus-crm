/**
 * Video lessons against the real database: starting and ending a group's call,
 * staff and student joins, the signalling relay, students' links and the
 * VIDEO integration settings. Rows carry a run-specific tag and are removed at the end.
 */
import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { videoBitrate } from "@/features/video/call-engine";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { videoIntegrationSchema } from "@/lib/validation/integrations";
import { videoLinksSmsSchema, videoSyncSchema } from "@/lib/validation/video";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import {
  getIntegration,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";
import {
  endVideoRoom,
  getClassPage,
  getGroupVideo,
  getVideoRoom,
  iceServersFor,
  loadVideoConfig,
  joinVideoRoomAsStaff,
  joinVideoRoomAsStudent,
  listStudentLinks,
  resetStudentLink,
  smsStudentLinks,
  startVideoRoom,
  syncVideoPeer,
} from "@/server/services/video/video.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `v${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const otherTeacher = actor("Other", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const cashier = actor("Cashier", ["CASHIER"], [...DEFAULT_ROLE_PERMISSIONS.CASHIER]);

let branchA: string;
let groupA: string;
let membershipOne: string;
let membershipTwo: string;
let studentOne: string;
let previousVideo: { isEnabled: boolean; config: unknown } | null = null;

const sync = (
  id: string,
  secret: string,
  extra: Partial<Parameters<typeof syncVideoPeer>[1]> = {},
) => syncVideoPeer(id, videoSyncSchema.parse({ secret, ...extra }));

beforeAll(async () => {
  // The demo centre's row only: other test files give their own centres a VIDEO row.
  const stored = await prisma.integrationSetting.findFirst({
    where: { provider: "VIDEO", organizationId: DEMO_ORG_ID },
  });
  previousVideo = stored ? { isEnabled: stored.isEnabled, config: stored.config } : null;

  const roles = await prisma.role.findMany({ where: { code: { in: ["TEACHER", "CASHIER"] } } });
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  for (const [a, n, code] of [
    [ceo, 1, null],
    [teacher, 2, "TEACHER"],
    [otherTeacher, 3, "TEACHER"],
    [cashier, 4, "CASHIER"],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${a.fullName}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    a.userId = user.id;
    a.fullName = user.fullName;
    if (code) await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(code) } });
  }
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [teacher, otherTeacher, cashier].map((a) => ({ userId: a.userId, branchId: branchA })),
  });
  for (const a of [teacher, otherTeacher, cashier]) a.branchIds = [branchA];
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupA = (
    await createGroup(ceo, {
      branchId: branchA,
      name: `${TAG} GE-A`,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVERY_DAY",
      slots: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipOne = one.id;
  studentOne = one.studentId;
  const two = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Student Two` },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipTwo = two.id;
});

afterAll(async () => {
  const organizationId = DEMO_ORG_ID;
  if (previousVideo) {
    await prisma.integrationSetting.update({
      where: { organizationId_provider: { organizationId, provider: "VIDEO" } },
      data: {
        isEnabled: previousVideo.isEnabled,
        config: previousVideo.config as object,
      },
    });
  } else {
    await prisma.integrationSetting.deleteMany({ where: { organizationId, provider: "VIDEO" } });
  }
  await prisma.smsMessage.deleteMany({ where: { branchId: branchA } });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  await prisma.auditLog.deleteMany({ where: { branchId: branchA } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  await prisma.branch.delete({ where: { id: branchA } });
});

describe("pure helpers", () => {
  it("builds ICE servers with STUN only, static TURN, or TURN REST credentials", () => {
    const base = {
      stunUrls: ["stun:a:3478"],
      turnUrls: [],
      turnUsername: "",
      turnCredential: "",
      turnSecret: "",
    };
    expect(iceServersFor(base, "p1")).toEqual([{ urls: ["stun:a:3478"] }]);

    const fixed = iceServersFor(
      { ...base, turnUrls: ["turn:t:3478"], turnUsername: "u", turnCredential: "c" },
      "p1",
    );
    expect(fixed[1]).toEqual({ urls: ["turn:t:3478"], username: "u", credential: "c" });

    const now = new Date("2026-10-05T10:00:00Z");
    const minted = iceServersFor(
      { ...base, turnUrls: ["turns:t:443"], turnUsername: "ignored", turnSecret: "s3cret" },
      "p1",
      now,
      3600,
    )[1]!;
    const expiry = Math.floor(now.getTime() / 1000) + 3600;
    expect(minted.username).toBe(`${expiry}:p1`);
    expect(minted.credential).toBe(
      createHmac("sha1", "s3cret").update(`${expiry}:p1`).digest("base64"),
    );
  });

  it("uses the deployment's relay when Settings name none", async () => {
    await prisma.integrationSetting.deleteMany({ where: { provider: "VIDEO" } });
    const env = {
      TURN_URLS: "turn:1.2.3.4:3478?transport=udp, turn:1.2.3.4:3478?transport=tcp",
      TURN_SECRET: "env-secret",
    };
    const fromEnv = await loadVideoConfig(prisma, DEMO_ORG_ID, env);
    expect(fromEnv.turnUrls).toEqual([
      "turn:1.2.3.4:3478?transport=udp",
      "turn:1.2.3.4:3478?transport=tcp",
    ]);
    expect(fromEnv.turnSecret).toBe("env-secret");
    expect(await loadVideoConfig(prisma, DEMO_ORG_ID, {})).toMatchObject({
      turnUrls: [],
      turnSecret: "",
    });
    await updateIntegration(
      ceo,
      "VIDEO",
      videoIntegrationSchema.parse({ isEnabled: true, turnUrls: "turn:own:3478", turnSecret: "s" }),
    );
    const fromSettings = await loadVideoConfig(prisma, DEMO_ORG_ID, env);
    expect(fromSettings).toMatchObject({ turnUrls: ["turn:own:3478"], turnSecret: "s" });
    await prisma.integrationSetting.deleteMany({ where: { provider: "VIDEO" } });
  });

  it("shrinks each upload as the room grows", () => {
    expect(videoBitrate("HOST", 2)).toBeGreaterThan(videoBitrate("HOST", 10));
    expect(videoBitrate("STUDENT", 1)).toBe(400_000);
    expect(videoBitrate("STUDENT", 20)).toBe(120_000);
  });

  it("validates ICE URLs and the SMS placeholder", () => {
    expect(
      videoIntegrationSchema.safeParse({ isEnabled: true, stunUrls: "http://x" }).success,
    ).toBe(false);
    expect(
      videoIntegrationSchema.safeParse({
        isEnabled: true,
        stunUrls: "stun:a:1, stun:b:2",
        turnUrls: "turn:t:3478?transport=udp turns:t:443",
      }).success,
    ).toBe(true);
    expect(videoLinksSmsSchema.safeParse({ text: "no link here" }).success).toBe(false);
  });
});

describe("video lessons", () => {
  let roomId: string;
  let tokenOne: string;

  it("is on by default and keeps TURN secrets masked", async () => {
    await prisma.integrationSetting.deleteMany({ where: { provider: "VIDEO" } });
    const dto = await getIntegration(ceo, "VIDEO");
    expect(dto.isEnabled).toBe(true);
    expect(String(dto.config.stunUrls)).toContain("stun:");
    await updateIntegration(
      ceo,
      "VIDEO",
      videoIntegrationSchema.parse({
        isEnabled: true,
        turnUrls: "turn:turn.kampus.test:3478",
        turnSecret: "top-secret",
        maxParticipants: 3,
      }),
    );
    const after = await getIntegration(ceo, "VIDEO");
    expect(after.config.turnSecret).not.toBe("top-secret");
    expect(after.config.maxParticipants).toBe(3);
  });

  it("lets only people who mark attendance start the call, once per group", async () => {
    await expect(startVideoRoom(cashier, groupA, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(startVideoRoom(otherTeacher, groupA, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const room = await startVideoRoom(teacher, groupA, {});
    roomId = room.id;
    expect(room.status).toBe("LIVE");
    expect(room.startedByName).toBe(teacher.fullName);
    const again = await startVideoRoom(ceo, groupA, {});
    expect(again.id).toBe(roomId);
    const card = await getGroupVideo(cashier, groupA);
    expect(card.room?.id).toBe(roomId);
  });

  it("gives students personal links that open the running call", async () => {
    await expect(listStudentLinks(cashier, groupA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const links = await listStudentLinks(teacher, groupA);
    expect(links.map((l) => l.membershipId).sort()).toEqual([membershipOne, membershipTwo].sort());
    tokenOne = links.find((l) => l.membershipId === membershipOne)!.token;
    expect(
      (await listStudentLinks(teacher, groupA)).find((l) => l.membershipId === membershipOne)!
        .token,
    ).toBe(tokenOne);
    const page = await getClassPage(tokenOne);
    expect(page).toMatchObject({ studentName: `${TAG} Student One`, roomId, enabled: true });
    expect(await getClassPage("not-a-real-token-at-all-123")).toBeNull();
  });

  it("relays signals between joined browsers and removes acknowledged ones", async () => {
    const host = await joinVideoRoomAsStaff(teacher, roomId);
    expect(host.role).toBe("HOST");
    expect(host.canEnd).toBe(true);
    expect(host.iceServers[1]?.username).toMatch(new RegExp(`:${host.participantId}$`));
    const guest = await joinVideoRoomAsStaff(cashier, roomId);
    expect(guest).toMatchObject({ role: "STAFF", canEnd: false });
    const student = await joinVideoRoomAsStudent(tokenOne);
    expect(student.role).toBe("STUDENT");

    const first = await sync(student.participantId, student.secret, {
      signals: [{ to: host.participantId, kind: "offer", payload: { type: "offer", sdp: "x" } }],
      state: { audio: true, video: false, screen: false, hand: true },
    });
    expect(first.status).toBe("LIVE");
    expect(first.peers.map((p) => p.id).sort()).toEqual(
      [host.participantId, guest.participantId].sort(),
    );

    const got = await sync(host.participantId, host.secret);
    expect(got.signals).toHaveLength(1);
    expect(got.signals[0]).toMatchObject({ from: student.participantId, kind: "offer" });
    expect(got.peers.find((p) => p.id === student.participantId)?.media).toEqual({
      audio: true,
      video: false,
      screen: false,
      hand: true,
    });
    const acked = await sync(host.participantId, host.secret, { after: got.signals[0]!.id });
    expect(acked.signals).toHaveLength(0);
    expect(await prisma.videoSignal.count({ where: { roomId } })).toBe(0);

    // Chat reaches anyone; "mute" is kept only when the teacher sends it.
    await sync(student.participantId, student.secret, {
      signals: [
        { to: host.participantId, kind: "chat", payload: { text: "hi" } },
        { to: guest.participantId, kind: "mute", payload: null },
      ],
    });
    await sync(host.participantId, host.secret, {
      signals: [{ to: guest.participantId, kind: "mute", payload: null }],
    });
    const guestInbox = await sync(guest.participantId, guest.secret);
    expect(guestInbox.signals.map((s) => [s.from, s.kind])).toEqual([[host.participantId, "mute"]]);
    const hostInbox = await sync(host.participantId, host.secret);
    expect(hostInbox.signals.map((s) => s.kind)).toEqual(["chat"]);
    await sync(host.participantId, host.secret, { after: hostInbox.signals[0]!.id });
    await sync(guest.participantId, guest.secret, { after: guestInbox.signals[0]!.id });

    await expect(sync(host.participantId, "wrong-secret-wrong-secret")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Rejoining from another tab closes the earlier one instead of filling a seat.
    const again = await joinVideoRoomAsStudent(tokenOne);
    expect((await sync(student.participantId, student.secret)).status).toBe("GONE");
    // Three people is the limit set above.
    const tokenTwo = (await listStudentLinks(teacher, groupA)).find(
      (l) => l.membershipId === membershipTwo,
    )!.token;
    await expect(joinVideoRoomAsStudent(tokenTwo)).rejects.toMatchObject({ code: "CONFLICT" });
    await sync(guest.participantId, guest.secret, { leave: true });
    await joinVideoRoomAsStudent(tokenTwo);
    expect(again.participantId).not.toBe(student.participantId);
  });

  it("replaces a passed-on link", async () => {
    const next = await resetStudentLink(teacher, membershipOne);
    expect(next.token).not.toBe(tokenOne);
    expect(await getClassPage(tokenOne)).toBeNull();
    tokenOne = next.token;
  });

  it("texts each student their own link and skips those without a phone", async () => {
    const result = await smsStudentLinks(
      teacher,
      groupA,
      { text: "{studentName}: {link}" },
      "https://kampus.test",
    );
    expect(result.total).toBe(1);
    expect(result.skipped).toBe(1);
    const sms = await prisma.smsMessage.findFirstOrThrow({
      where: { branchId: branchA, studentId: studentOne },
    });
    expect(sms.text).toBe(`${TAG} Student One: https://kampus.test/class/${tokenOne}`);
  });

  it("ends the call for everyone and remembers who came", async () => {
    await expect(endVideoRoom(cashier, roomId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await endVideoRoom(teacher, roomId);
    const card = await getGroupVideo(teacher, groupA);
    expect(card.room).toBeNull();
    expect(card.lastRoom?.id).toBe(roomId);
    expect(card.lastRoom?.students.map((s) => s.fullName).sort()).toEqual([
      `${TAG} Student One`,
      `${TAG} Student Two`,
    ]);
    expect((await getClassPage(tokenOne))?.roomId).toBeNull();
    await expect(joinVideoRoomAsStudent(tokenOne)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(joinVideoRoomAsStaff(teacher, roomId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("ends a call by itself 150 minutes after it started", async () => {
    const room = await startVideoRoom(teacher, groupA, {});
    const host = await joinVideoRoomAsStaff(teacher, room.id);
    expect((await sync(host.participantId, host.secret)).status).toBe("LIVE");
    const startedAt = new Date(Date.now() - 151 * 60_000);
    await prisma.videoRoom.update({ where: { id: room.id }, data: { startedAt } });

    // The host is still connected, but the time is up.
    expect((await sync(host.participantId, host.secret)).status).toBe("ENDED");
    const ended = await prisma.videoRoom.findUniqueOrThrow({ where: { id: room.id } });
    expect(ended.status).toBe("ENDED");
    expect(ended.endedAt?.getTime()).toBe(startedAt.getTime() + 150 * 60_000);
    expect((await getGroupVideo(teacher, groupA)).room).toBeNull();
    await expect(joinVideoRoomAsStaff(teacher, room.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // A call that is over time is closed by the next look too, not only by a sync.
    const next = await startVideoRoom(teacher, groupA, {});
    expect(next.id).not.toBe(room.id);
    await prisma.videoRoom.update({ where: { id: next.id }, data: { startedAt } });
    expect((await getVideoRoom(teacher, next.id)).status).toBe("ENDED");
    expect((await startVideoRoom(teacher, groupA, {})).id).not.toBe(next.id);
  });

  it("refuses new calls while switched off", async () => {
    await updateIntegration(ceo, "VIDEO", videoIntegrationSchema.parse({ isEnabled: false }));
    await expect(startVideoRoom(teacher, groupA, {})).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getClassPage(tokenOne))?.enabled).toBe(false);
  });
});
