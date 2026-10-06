/**
 * Lesson materials against the real database (A-105): a teacher adds a link and
 * a file, a recording is streamed in from a call, the student's link lists and
 * may open them, and a deleted recording takes its file along.
 * Rows carry a run-specific tag and are removed at the end.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { materialSchema } from "@/lib/validation/groups";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { portalFileAllowed } from "@/server/services/homework/homework.service";
import {
  addMaterial,
  deleteMaterial,
  listGroupMaterials,
  listPortalMaterials,
  saveRecording,
} from "@/server/services/materials/materials.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { listStudentLinks, startVideoRoom } from "@/server/services/video/video.service";
import { fileResponse } from "@/server/storage/http";
import { LocalStorage } from "@/server/storage/local";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `m${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const otherTeacher = actor("Other", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let branchId: string;
let groupId: string;
let membershipOne: string;
let tokenOne: string;
let lessonId: string;
let uploadDir: string;

function bodyOf(bytes: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(1024).fill(7);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const n = Math.min(chunk.byteLength, bytes - sent);
      controller.enqueue(chunk.subarray(0, n));
      sent += n;
    },
  });
}

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "kampus-materials-"));
  process.env.UPLOAD_DIR = uploadDir;
  const teacherRole = await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n, withRole] of [
    [ceo, 1, false],
    [teacher, 2, true],
    [otherTeacher, 3, true],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
    if (withRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: teacherRole.id } });
    }
  }
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.activeBranchId = branchId;
  await prisma.userBranch.createMany({
    data: [teacher, otherTeacher].map((a) => ({ userId: a.userId, branchId })),
  });
  teacher.branchIds = [branchId];
  otherTeacher.branchIds = [branchId];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 0,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} A1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipOne = one.id;
  lessonId = (
    await prisma.lesson.findFirstOrThrow({ where: { groupId }, orderBy: { date: "asc" } })
  ).id;
  tokenOne = (await listStudentLinks(teacher, groupId)).find(
    (l) => l.membershipId === membershipOne,
  )!.token;
});

afterAll(async () => {
  // Guarded: a setup that failed early must not turn these into table-wide deletes.
  if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.student.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
});

describe("lesson materials", () => {
  it("validates links and stored files the way the dialog sends them", () => {
    expect(
      materialSchema.parse({
        lessonId: "",
        kind: "LINK",
        title: " Slides ",
        url: "https://x.uz/a",
      }),
    ).toEqual({ lessonId: null, kind: "LINK", title: "Slides", url: "https://x.uz/a" });
    expect(materialSchema.safeParse({ kind: "LINK", title: "a", url: "x.uz" }).success).toBe(false);
    expect(
      materialSchema.safeParse({ kind: "FILE", title: "a", url: "https://evil/x.pdf" }).success,
    ).toBe(false);
    expect(
      materialSchema.safeParse({
        kind: "FILE",
        title: "a",
        url: "/api/v1/files/documents/0123456789abcdef0123456789abcdef.pdf",
      }).success,
    ).toBe(true);
  });

  it("lets the group's teacher add a link to a lesson and a file to the whole group", async () => {
    await expect(
      addMaterial(otherTeacher, groupId, {
        lessonId,
        kind: "LINK",
        title: "Slides",
        url: "https://x.uz/slides",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      addMaterial(teacher, groupId, {
        lessonId: "clzzzzzzzzzzzzzzzzzzzzzzz",
        kind: "LINK",
        title: "Slides",
        url: "https://x.uz/slides",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const link = await addMaterial(teacher, groupId, {
      lessonId,
      kind: "LINK",
      title: "Slides",
      url: "https://x.uz/slides",
    });
    expect(link).toMatchObject({ kind: "LINK", lessonId, createdByName: `${TAG} Teacher` });
    const fileUrl = "/api/v1/files/documents/0123456789abcdef0123456789abcdef.pdf";
    const file = await addMaterial(teacher, groupId, {
      lessonId: null,
      kind: "FILE",
      title: "Grammar sheet",
      url: fileUrl,
    });
    expect(file.lessonDate).toBeNull();

    const listed = await listGroupMaterials(teacher, groupId);
    expect(listed.items.map((m) => m.title)).toEqual(["Slides", "Grammar sheet"]);
    expect(listed.lessons.length).toBeGreaterThan(0);

    // The student's link sees both and may open the file, but not a stranger's file.
    const portal = (await listPortalMaterials(tokenOne))!;
    expect(portal.map((m) => m.title)).toEqual(["Slides", "Grammar sheet"]);
    expect(portal[1]!.url).toBe(
      `/api/v1/public/class/${tokenOne}/files/documents/0123456789abcdef0123456789abcdef.pdf`,
    );
    expect(
      await portalFileAllowed(tokenOne, "documents/0123456789abcdef0123456789abcdef.pdf"),
    ).toBe(true);
    expect(
      await portalFileAllowed(tokenOne, "documents/ffffffffffffffffffffffffffffffff.pdf"),
    ).toBe(false);
    expect(await listPortalMaterials("no-such-token")).toBeNull();
  });

  it("streams a call recording into the lesson's materials and removes the file on delete", async () => {
    const room = await startVideoRoom(teacher, groupId, { lessonId });
    await expect(
      saveRecording(teacher, room.id, {
        contentType: "text/plain",
        body: bodyOf(10),
        durationSec: 1,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      saveRecording(otherTeacher, room.id, {
        contentType: "video/webm",
        body: bodyOf(10),
        durationSec: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const saved = await saveRecording(teacher, room.id, {
      contentType: "video/webm;codecs=vp8,opus",
      body: bodyOf(5000),
      durationSec: 61.4,
    });
    expect(saved).toMatchObject({ kind: "RECORDING", lessonId, size: 5000, durationSec: 61 });
    expect(saved.title).toContain(`${TAG} A1`);
    const key = saved.url.slice("/api/v1/files/".length);
    expect(key).toMatch(/^recordings\/[a-f0-9]{32}\.webm$/);
    expect(await portalFileAllowed(tokenOne, key)).toBe(true);

    // Byte ranges, so the browser can seek.
    const storage = new LocalStorage(uploadDir);
    const whole = (await fileResponse(storage, key, new Request("http://x/"), "no-store"))!;
    expect(whole.status).toBe(200);
    expect(whole.headers.get("Content-Length")).toBe("5000");
    expect(whole.headers.get("Accept-Ranges")).toBe("bytes");
    const part = (await fileResponse(
      storage,
      key,
      new Request("http://x/", { headers: { Range: "bytes=4990-" } }),
      "no-store",
    ))!;
    expect(part.status).toBe(206);
    expect(part.headers.get("Content-Range")).toBe("bytes 4990-4999/5000");
    expect((await part.arrayBuffer()).byteLength).toBe(10);
    const beyond = (await fileResponse(
      storage,
      key,
      new Request("http://x/", { headers: { Range: "bytes=9000-" } }),
      "no-store",
    ))!;
    expect(beyond.status).toBe(416);
    expect(
      await fileResponse(
        storage,
        "recordings/" + "0".repeat(32) + ".webm",
        new Request("http://x/"),
        "no-store",
      ),
    ).toBeNull();

    await deleteMaterial(teacher, saved.id);
    expect(await storage.getRange(key)).toBeNull();
    expect(await prisma.lessonMaterial.count({ where: { id: saved.id } })).toBe(0);
  });

  it("refuses recordings over the size limit and keeps nothing", async () => {
    const storage = new LocalStorage(uploadDir);
    await expect(
      storage.putStream("recordings/" + "a".repeat(32) + ".webm", bodyOf(3000), "video/webm", 2048),
    ).rejects.toThrow("TOO_LARGE");
    expect(await storage.getRange("recordings/" + "a".repeat(32) + ".webm")).toBeNull();
  });
});
