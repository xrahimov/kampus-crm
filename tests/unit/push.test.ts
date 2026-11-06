/**
 * Web Push for the student app (A-176): a browser subscribes through the
 * student's link, the texts the bot sends are queued to it too, a gone
 * endpoint is removed, and the VAPID pair is made once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import {
  getVapidKeys,
  pushSubscribed,
  sendPush,
  subscribePush,
  unsubscribePush,
} from "@/server/services/push/push.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `push${RUN}`;
const ENDPOINT = `https://push.example.test/send/${TAG}`;

const ceo: Actor = {
  userId: "",
  fullName: `${TAG} CEO`,
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let groupId: string;
let studentId: string;
let token: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `+99895${RUN}01`,
      fullName: ceo.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 1,
      gradingSystemId: null,
      color: "#0F766E",
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [{ weekday: 1, startTime: "10:00", endTime: "11:00", roomId: null }],
      teachers: [],
      startDate: "2026-01-05",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const member = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student`, phone: `+99895${RUN}02` },
    joinedAt: "2026-01-05",
    status: "ACTIVE",
  });
  studentId = member.studentId;
  token = (await listStudentLinks(ceo, groupId))[0]!.token;
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { uniqueKey: { contains: TAG } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: ceo.userId }] } });
  await prisma.groupMembership.deleteMany({ where: { studentId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: ceo.userId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("web push", () => {
  it("makes the VAPID pair once and keeps it", async () => {
    const first = await getVapidKeys();
    const second = await getVapidKeys();
    expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]{80,100}$/);
    expect(second).toEqual(first);
  });

  it("subscribes a browser through the student's link and refuses unknown links", async () => {
    const input = {
      endpoint: ENDPOINT,
      keys: { p256dh: "BPk".padEnd(87, "a"), auth: "auth".padEnd(22, "b") },
      locale: "ru" as const,
      path: `/ru/class/${token}`,
    };
    expect(await subscribePush("x".repeat(24), input, null)).toBe(false);
    expect(await subscribePush(token, input, "Mozilla/5.0 test")).toBe(true);
    // Subscribing again from the same browser updates, never duplicates.
    expect(await subscribePush(token, { ...input, locale: "en" }, null)).toBe(true);
    const rows = await prisma.pushSubscription.findMany({ where: { studentId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ endpoint: ENDPOINT, locale: "en", path: input.path });
    expect(await pushSubscribed(token, ENDPOINT)).toBe(true);
    expect(await pushSubscribed(token, "https://elsewhere.test/x")).toBe(false);
  });

  it("queues the bot's texts to the browser in the page's language", async () => {
    const queued = await notifyStudents(prisma, {
      studentIds: [studentId],
      kind: "homeworkSet",
      refKey: `${TAG}-hw`,
      values: { group: `${TAG} Group`, text: "Read chapter 2", date: "6 Nov" },
    });
    // No Telegram chat: the browser is the only recipient.
    expect(queued).toBe(1);
    const job = await prisma.job.findFirstOrThrow({
      where: { type: "push.send", uniqueKey: { startsWith: `push:${TAG}-hw:` } },
    });
    const payload = job.payload as { title: string; body: string; tag: string };
    expect(payload.title).toBe("Kampus");
    expect(payload.tag).toBe("homeworkSet");
    expect(payload.body).toContain(`${TAG} Group`);
    expect(payload.body).toContain("Read chapter 2");
    // Sending once more under the same key queues nothing new.
    expect(
      await notifyStudents(prisma, {
        studentIds: [studentId],
        kind: "homeworkSet",
        refKey: `${TAG}-hw`,
        values: { group: `${TAG} Group`, text: "Read chapter 2", date: "6 Nov" },
      }),
    ).toBe(0);
  });

  it("sends with the VAPID details and drops a subscription the push service no longer knows", async () => {
    const sub = await prisma.pushSubscription.findFirstOrThrow({ where: { studentId } });
    const calls: Array<{ endpoint: string; payload: string; subject: string }> = [];
    const result = await sendPush(
      prisma,
      { subscriptionId: sub.id, title: "Kampus", body: "Hello", tag: "t" },
      async (subscription, payload, options) => {
        calls.push({
          endpoint: subscription.endpoint,
          payload,
          subject: options.vapidDetails.subject,
        });
      },
      { APP_URL: "https://kampus.example.test" },
    );
    expect(result).toBe("sent");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.endpoint).toBe(ENDPOINT);
    expect(calls[0]!.subject).toBe("https://kampus.example.test");
    expect(JSON.parse(calls[0]!.payload)).toEqual({
      title: "Kampus",
      body: "Hello",
      url: `/ru/class/${token}`,
      tag: "t",
    });

    const gone = Object.assign(new Error("gone"), { statusCode: 410 });
    expect(
      await sendPush(prisma, { subscriptionId: sub.id, title: "Kampus", body: "x" }, async () => {
        throw gone;
      }),
    ).toBe("gone");
    expect(await prisma.pushSubscription.count({ where: { id: sub.id } })).toBe(0);
    expect(await sendPush(prisma, { subscriptionId: sub.id, title: "Kampus", body: "x" })).toBe(
      "skipped",
    );

    // A fresh subscription can be switched off from the page again.
    await subscribePush(
      token,
      {
        endpoint: ENDPOINT,
        keys: { p256dh: "a", auth: "b" },
        locale: "uz",
        path: `/uz/class/${token}`,
      },
      null,
    );
    expect(await unsubscribePush(token, ENDPOINT)).toBe(true);
    expect(await pushSubscribed(token, ENDPOINT)).toBe(false);
  });
});
