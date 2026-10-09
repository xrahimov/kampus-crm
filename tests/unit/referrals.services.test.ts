/**
 * Referral programme (A-120) against the real database, inside a centre of its
 * own: invite codes, the public form with `?ref=`, the one-time credit (coins
 * and the bonus payment) when the brought student gets a group, and the report.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  getCoinSettings,
  studentBalance,
  updateCoinSettings,
} from "@/server/services/coins/coins.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createForm, submitPublicForm } from "@/server/services/leads/forms.service";
import { addLeadsToGroup, createLead } from "@/server/services/leads/leads.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import {
  assertReferrer,
  creditReferral,
  ensureReferralCode,
  getPortalReferral,
  getReferralsReport,
  referralSourceId,
  studentByReferralCode,
} from "@/server/services/students/referrals.service";
import { createStudent, getStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `rf${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const BONUS = 50_000;

const owner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
let ceo: Actor;
let organizationId: string;
let branchId: string;
let groupId: string;
let aliceId: string;
let aliceCode: string;
let friendSourceId: string;
let formSlug: string;
let columnId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} Owner`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
      isSiteOwner: true,
    },
  });
  owner.userId = user.id;
  owner.branchIds = await demoBranchIds();
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} Main`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchId = org.branches[0]!.id;
  const director = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: director.id,
    fullName: `${TAG} Director`,
    organizationId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchId],
    activeBranchId: branchId,
  };
  // Automatic coins on (the REFERRAL rule comes with the defaults) and a bonus of 50 000.
  const coins = await getCoinSettings(ceo);
  await updateCoinSettings(ceo, { autoCoins: true, rules: coins.rules });
  await prisma.orgSettings.upsert({
    where: { organizationId },
    update: { referralBonus: BONUS },
    create: { organizationId, referralBonus: BONUS },
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 3,
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
      weekdayPattern: "CUSTOM",
      slots: [{ weekday: 2, startTime: "10:00", endTime: "11:30", roomId: null }],
      teachers: [],
      startDate: today,
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  aliceId = (
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Alice`,
      phone: phone(11),
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: today, customPrice: null, note: null, status: "ACTIVE" },
    })
  ).id;
  aliceCode = await ensureReferralCode(prisma, aliceId);
  // The centre's lead sources: an advert and "a friend"; a board with one column; a public form.
  const [advert, friend] = await Promise.all([
    prisma.leadSource.create({ data: { organizationId, name: `${TAG} Advert` } }),
    prisma.leadSource.create({ data: { organizationId, name: `${TAG} Do‘st (friend)` } }),
  ]);
  friendSourceId = friend.id;
  const board = await prisma.leadBoard.create({ data: { branchId, name: `${TAG} Board` } });
  columnId = (await prisma.leadColumn.create({ data: { boardId: board.id, name: "New" } })).id;
  formSlug = `${TAG}-form`;
  await createForm(ceo, {
    name: `${TAG} Form`,
    slug: formSlug,
    columnId,
    sourceId: advert.id,
    integration: null,
    isActive: true,
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { organizationId }, { actor: { organizationId } }] },
  });
  await prisma.payment.deleteMany({ where: { branchId } });
  await prisma.leadForm.deleteMany({ where: { organizationId } });
  await prisma.lead.deleteMany({ where: { branchId } });
  await prisma.leadColumn.deleteMany({ where: { board: { branchId } } });
  await prisma.leadBoard.deleteMany({ where: { branchId } });
  await prisma.leadSource.deleteMany({ where: { organizationId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("invite codes", () => {
  it("are six readable characters, stable, and resolve within the centre only", async () => {
    expect(aliceCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(await ensureReferralCode(prisma, aliceId)).toBe(aliceCode);
    expect((await getStudent(ceo, aliceId)).referralCode).toBe(aliceCode);
    expect(await studentByReferralCode(prisma, organizationId, aliceCode.toLowerCase())).toEqual({
      id: aliceId,
      fullName: `${TAG} Alice`,
    });
    expect(await studentByReferralCode(prisma, DEMO_ORG_ID, aliceCode)).toBeNull();
    expect(await studentByReferralCode(prisma, organizationId, "nope")).toBeNull();
    expect(await referralSourceId(prisma, organizationId)).toBe(friendSourceId);
  });

  it("shows up on the student's page with the form link", async () => {
    const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === aliceId)!;
    const referral = await getPortalReferral(link.token, "uz");
    expect(referral?.code).toBe(aliceCode);
    expect(referral?.link).toMatch(new RegExp(`/uz/forms/${formSlug}\\?ref=${aliceCode}$`));
  });

  it("refuses a referrer who is the student themselves or from another centre", async () => {
    await expect(
      assertReferrer(prisma, organizationId, aliceId, "referredById", aliceId),
    ).rejects.toMatchObject({ fields: { referredById: ["validation.referralSelf"] } });
    await expect(assertReferrer(prisma, DEMO_ORG_ID, aliceId, "referrerId")).rejects.toMatchObject({
      fields: { referrerId: ["validation.referralUnknown"] },
    });
    await expect(assertReferrer(prisma, organizationId, aliceId, "referrerId")).resolves.toBe(
      undefined,
    );
  });
});

describe("a friend who comes through the link", () => {
  let leadId: string;
  let bobId: string;

  it("becomes a lead with the referrer and the friend source", async () => {
    const lead = await submitPublicForm(
      formSlug,
      { fullName: `${TAG} Bob`, phone: phone(12), comment: null, ref: aliceCode.toLowerCase() },
      "127.0.0.1",
    );
    leadId = lead.id;
    const row = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(row.referrerId).toBe(aliceId);
    expect(row.sourceId).toBe(friendSourceId);
    // An unknown code is ignored: the form's own source, no referrer.
    const other = await submitPublicForm(
      formSlug,
      { fullName: `${TAG} Nobody`, phone: phone(13), comment: null, ref: "ZZZZZZ" },
      "127.0.0.2",
    );
    const otherRow = await prisma.lead.findUniqueOrThrow({ where: { id: other.id } });
    expect(otherRow.referrerId).toBeNull();
    expect(otherRow.sourceId).not.toBe(friendSourceId);
    expect(await studentBalance(prisma, aliceId)).toBe(0);
  });

  it("credits the referrer once when the lead joins a group", async () => {
    const result = await addLeadsToGroup(ceo, {
      leadIds: [leadId],
      groupId,
      joinedAt: today,
      status: "ACTIVE",
    });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    bobId = lead.studentId!;
    expect(result.added).toBe(1);
    const bob = await prisma.student.findUniqueOrThrow({ where: { id: bobId } });
    expect(bob.referredById).toBe(aliceId);
    expect(bob.referralCreditedAt).not.toBeNull();
    // 30 coins by the default REFERRAL rule and a bonus-only payment on Alice's membership.
    expect(await studentBalance(prisma, aliceId)).toBe(30);
    const payment = await prisma.payment.findFirstOrThrow({ where: { referralOfId: bobId } });
    expect(payment.studentId).toBe(aliceId);
    expect(Number(payment.amount)).toBe(0);
    expect(Number(payment.bonus)).toBe(BONUS);
    expect(payment.comment).toBe(`Referral: ${TAG} Bob`);
    expect(payment.receivedById).toBe(ceo.userId);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "referral.credit", entityId: aliceId },
    });
    expect(audit?.after).toMatchObject({ referredStudentId: bobId, bonus: BONUS });
    // A second pass changes nothing.
    expect(await creditReferral(prisma, bobId, ceo)).toBe(false);
    expect(await studentBalance(prisma, aliceId)).toBe(30);
    expect(await prisma.payment.count({ where: { referralOfId: bobId } })).toBe(1);
    expect((await getStudent(ceo, aliceId)).referrals).toBe(1);
    expect((await getStudent(ceo, bobId)).referredByName).toBe(`${TAG} Alice`);
  });

  it("also credits a referrer named by staff, when the student gets a group", async () => {
    // Carol is created without a group: nothing yet.
    const carol = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Carol`,
      phone: phone(14),
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      referredById: aliceId,
      membership: null,
    });
    expect(await studentBalance(prisma, aliceId)).toBe(30);
    await addMember(ceo, groupId, {
      studentId: carol.id,
      status: "NEW",
      joinedAt: today,
      billingFrom: null,
      customPrice: null,
      note: null,
    });
    expect(await studentBalance(prisma, aliceId)).toBe(60);
    expect(await prisma.payment.count({ where: { referralOfId: carol.id } })).toBe(1);
    // A lead created by staff with the referrer, converted later, counts too; Bob's own
    // lead cannot name Bob.
    const lead = await createLead(ceo, {
      columnId,
      fullName: `${TAG} Dave`,
      phones: [phone(15)],
      birthDate: null,
      age: null,
      sourceId: null,
      referrerId: bobId,
      teacherId: null,
      days: null,
      lessonTime: null,
      status: "NEW",
      temperature: null,
      comment: null,
    });
    expect(lead.referrerName).toBe(`${TAG} Bob`);
    await addLeadsToGroup(ceo, { leadIds: [lead.id], groupId, joinedAt: today, status: "TRIAL" });
    expect(await studentBalance(prisma, bobId)).toBe(30);
  });

  it("is counted in the referral report", async () => {
    const report = await getReferralsReport(ceo, {});
    expect(report.kpis).toMatchObject({ leads: 2, joined: 3, coins: 90, bonus: BONUS * 3 });
    expect(report.kpis.referrers).toBe(2);
    expect(report.rows[0]).toMatchObject({
      fullName: `${TAG} Alice`,
      leads: 1,
      joined: 2,
      coins: 60,
      bonus: BONUS * 2,
    });
    expect(report.rows[1]).toMatchObject({
      fullName: `${TAG} Bob`,
      leads: 1,
      joined: 1,
      coins: 30,
    });
    expect(report.referred.map((r) => r.fullName).sort()).toEqual(
      [`${TAG} Bob`, `${TAG} Carol`, `${TAG} Dave`].sort(),
    );
    expect(report.referred.every((r) => r.joined)).toBe(true);
    const month = report.byMonth.find((m) => m.month === today.slice(0, 7));
    expect(month).toMatchObject({ leads: 2, joined: 3 });
  });
});
