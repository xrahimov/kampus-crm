/**
 * Class stream (A-164) against the real database: posts, pins, locks, the
 * students' comments from their link, and scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  addPortalComment,
  addStaffComment,
  createPost,
  deleteComment,
  deletePortalComment,
  deletePost,
  listGroupStream,
  listPortalStream,
  updatePost,
} from "@/server/services/stream/stream.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `st${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const teacher: Actor = {
  ...ceo,
  fullName: `${TAG} Teacher`,
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};
const stranger: Actor = { ...teacher, fullName: "Elsewhere" };

let groupId: string;
let anna: { token: string };
let bob: { token: string };

beforeAll(async () => {
  const [user, teacherUser] = await Promise.all(
    ["CEO", "Teacher"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99892${RUN}6${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  stranger.userId = teacherUser!.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  teacher.activeBranchId = branchId;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:00",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
      startDate: iso(new Date()),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const make = async (name: string, phone: string) => {
    const s = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone,
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: {
        groupId,
        joinedAt: iso(new Date()),
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
    });
    const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === s.id)!;
    return { token: link.token };
  };
  anna = await make("Anna", `+99892${RUN}71`);
  bob = await make("Bob", `+99892${RUN}72`);
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("class stream (A-164)", () => {
  it("posts, pins and lists newest first with pinned on top", async () => {
    const first = await createPost(teacher, groupId, { body: "Welcome to the course" });
    expect(first).toMatchObject({
      body: "Welcome to the course",
      author: `${TAG} Teacher`,
      pinned: false,
      locked: false,
      comments: [],
    });
    await createPost(teacher, groupId, { body: "Bring your books on Monday" });
    const pinned = await createPost(teacher, groupId, { body: "Rules of the group", pinned: true });
    const list = await listGroupStream(teacher, groupId);
    expect(list.map((p) => p.body)).toEqual([
      "Rules of the group",
      "Bring your books on Monday",
      "Welcome to the course",
    ]);
    expect(list[0]!.id).toBe(pinned.id);
    await expect(listGroupStream(stranger, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPost(stranger, groupId, { body: "x" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const unpinned = await updatePost(teacher, pinned.id, {
      body: "Rules of the group",
      pinned: false,
    });
    expect(unpinned.pinned).toBe(false);
    expect((await listGroupStream(teacher, groupId))[0]!.body).toBe("Rules of the group");
  });

  it("lets students comment from their link, take their own back, and respects a lock", async () => {
    const [post] = await listGroupStream(teacher, groupId);
    const mine = (await listPortalStream(anna.token))!;
    expect(mine).toHaveLength(3);

    const withComment = (await addPortalComment(anna.token, post!.id, { body: "Understood!" }))!;
    expect(withComment.comments).toHaveLength(1);
    expect(withComment.comments[0]).toMatchObject({
      body: "Understood!",
      author: `${TAG} Anna`,
      byStaff: false,
      mine: true,
    });
    // Bob sees Anna's comment but it is not his.
    const his = (await listPortalStream(bob.token))!;
    expect(his.find((p) => p.id === post!.id)!.comments[0]).toMatchObject({ mine: false });
    await expect(deletePortalComment(bob.token, withComment.comments[0]!.id)).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );

    const replied = await addStaffComment(teacher, post!.id, { body: "Good." });
    expect(replied.comments.map((c) => [c.author, c.byStaff])).toEqual([
      [`${TAG} Anna`, false],
      [`${TAG} Teacher`, true],
    ]);

    await updatePost(teacher, post!.id, { body: post!.body, locked: true });
    await expect(addPortalComment(bob.token, post!.id, { body: "Late" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.streamLocked",
    });

    // Anna takes her comment back; the teacher removes their own; the post goes with the rest.
    const afterMine = (await deletePortalComment(anna.token, withComment.comments[0]!.id))!;
    expect(afterMine.comments.map((c) => c.author)).toEqual([`${TAG} Teacher`]);
    await deleteComment(teacher, afterMine.comments[0]!.id);
    expect((await listGroupStream(teacher, groupId))[0]!.comments).toEqual([]);
    await deletePost(teacher, post!.id);
    expect(await listGroupStream(teacher, groupId)).toHaveLength(2);
    expect(await listPortalStream("not-a-real-token-at-all")).toBeNull();
  });
});
