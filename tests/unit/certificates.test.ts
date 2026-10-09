/**
 * Certificates of graduation (round 2 G2, A-140): issued once per graduated
 * membership with a yearly number, checked by anyone with the code, revoked and
 * re-issued, and listed on the student's own page.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember, updateMembership } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import {
  checkCertificate,
  getCertificate,
  issueCertificate,
  listPortalCertificates,
  revokeCertificate,
} from "@/server/services/students/certificates.service";
import { setGraduateRecord } from "@/server/services/reports/graduates.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `ct${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let groupId: string;
let graduate: { id: string; studentId: string };
let active: { id: string; studentId: string };

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
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
      name: `${TAG} English`,
      description: undefined,
      price: 200_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const roomId = (await createRoom(ceo, { branchId, name: `${TAG} Room`, capacity: 10 })).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} GE-A`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "10:30",
        roomId,
      })),
      teachers: [],
      startDate: daysAgo(60),
      endDate: null,
      status: "ACTIVE",
      ignoreClashes: true,
    })
  ).id;
  const member = (fullName: string, n: number) =>
    addMember(ceo, groupId, {
      newStudent: { fullName, phone: phone(n) },
      joinedAt: daysAgo(60),
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
  graduate = await member(`${TAG} Graduate`, 11);
  active = await member(`${TAG} Active`, 12);
  await updateMembership(ceo, graduate.id, { status: "GRADUATED" });
  await setGraduateRecord(ceo, graduate.id, { cefrLevel: "B2" });
  await prisma.studentTelegramChat.create({
    data: { studentId: graduate.studentId, chatId: `${TAG}-chat`, locale: "en" },
  });
});

afterAll(async () => {
  if (groupId) {
    await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
  }
});

describe("certificates of graduation", () => {
  it("issues one per graduate with a yearly number, the course and the CEFR level by default", async () => {
    await expect(issueCertificate(ceo, active.id, { title: "English" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.notGraduated",
    });

    const issued = await issueCertificate(ceo, graduate.id, { title: `${TAG} English` });
    const year = new Date().getUTCFullYear();
    expect(issued).toMatchObject({
      title: `${TAG} English`,
      level: "B2",
      revokedAt: null,
      student: { fullName: `${TAG} Graduate` },
      course: `${TAG} English`,
      group: `${TAG} GE-A`,
    });
    expect(issued.number).toMatch(new RegExp(`^${year}-\\d{4}$`));
    expect(issued.url).toContain(`/cert/${issued.code}`);
    expect(issued.issuedAt).toBe(iso(new Date()));

    await expect(issueCertificate(ceo, graduate.id, { title: "Again" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.certificateExists",
    });

    // The student is told on Telegram, once.
    const jobs = await prisma.job.findMany({
      where: { uniqueKey: `tg:certificate:${issued.id}:${issued.code}:${TAG}-chat` },
    });
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs[0]!.payload)).toContain(issued.url);

    const again = await getCertificate(ceo, issued.id);
    expect(again.number).toBe(issued.number);
  });

  it("is checked by code, revoked and re-issued under the same number", async () => {
    const row = await prisma.certificate.findUniqueOrThrow({
      where: { membershipId: graduate.id },
    });
    const check = await checkCertificate(row.code);
    expect(check).toMatchObject({
      number: row.number,
      studentName: `${TAG} Graduate`,
      level: "B2",
      revokedAt: null,
    });
    expect(await checkCertificate("nope")).toBeNull();
    expect(await checkCertificate("no-such-code-here")).toBeNull();

    const revoked = await revokeCertificate(ceo, row.id);
    expect(revoked.revokedAt).not.toBeNull();
    expect((await checkCertificate(row.code))?.revokedAt).not.toBeNull();
    await expect(revokeCertificate(ceo, row.id)).rejects.toMatchObject({
      message: "errors.certificateRevoked",
    });

    const reissued = await issueCertificate(ceo, graduate.id, {
      title: `${TAG} English`,
      level: "C1",
      issuedAt: daysAgo(1),
    });
    expect(reissued.number).toBe(row.number);
    expect(reissued.code).not.toBe(row.code);
    expect(reissued).toMatchObject({ level: "C1", issuedAt: daysAgo(1), revokedAt: null });
    expect(await checkCertificate(row.code)).toBeNull();
  });

  it("lists the student's valid certificates on their personal page", async () => {
    const membership = await prisma.groupMembership.update({
      where: { id: active.id },
      data: { videoToken: `${TAG}tokentokentokentoken` },
      select: { videoToken: true },
    });
    expect(await listPortalCertificates(membership.videoToken!)).toEqual([]);

    const graduatedToo = await prisma.groupMembership.findUniqueOrThrow({
      where: { id: graduate.id },
      select: { videoToken: true },
    });
    // A graduated membership's link no longer opens a page.
    if (graduatedToo.videoToken) {
      expect(await listPortalCertificates(graduatedToo.videoToken)).toBeNull();
    }
    // Give the graduate a second, active membership: its page lists the certificate.
    const second = await prisma.groupMembership.update({
      where: { id: graduate.id },
      data: { status: "ACTIVE", leftAt: null, videoToken: `${TAG}secondsecondsecondsec` },
      select: { videoToken: true },
    });
    const listed = await listPortalCertificates(second.videoToken!);
    expect(listed).toHaveLength(1);
    expect(listed![0]).toMatchObject({ level: "C1", title: `${TAG} English` });
    expect(listed![0]!.url).toContain("/cert/");
    await prisma.groupMembership.update({
      where: { id: graduate.id },
      data: { status: "GRADUATED", leftAt: new Date() },
    });
  });
});
