/**
 * The summary each staff member gets (A-190), against the real database in a
 * centre of its own with two branches: the CEO sees the whole centre and each
 * branch beside the other, a branch manager only their branch, a teacher only
 * the groups they teach, and nobody ever reads a figure or a name from a
 * branch or group that is not theirs. Without a key the conclusion is the
 * plain lines; with one the model is asked once, from the same figures the
 * person sees, and its text is kept.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { canUseAssistant, canViewModule } from "@/lib/rbac/permissions";
import { prisma } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import type { AiClient, AiRequest } from "@/server/integrations/ai/client";
import type { Actor } from "@/server/rbac/authorize";
import {
  briefingRange,
  briefingSystemPrompt,
  getBriefing,
  type BriefingDto,
} from "@/server/services/ai/briefing.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { centreToday } from "@/server/services/groups/shared";
import type * as Integrations from "@/server/services/integrations/integrations.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

/** The model the centre "has a key for" while a test sets one; null leaves the built-in test client. */
const ai = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/server/services/integrations/integrations.service", async (original) => {
  const real = await original<typeof Integrations>();
  return {
    ...real,
    getAiClient: async (...args: Parameters<typeof real.getAiClient>) =>
      (ai.client as AiClient | null) ?? real.getAiClient(...args),
  };
});

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `bf${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const shift = (iso: string, days: number) => {
  const d = day(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const TODAY = centreToday();
const YESTERDAY = shift(TODAY, -1);

const owner: Actor = {
  userId: "",
  fullName: `${TAG} Owner`,
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
let organizationId = "";
let branchA = "";
let branchB = "";
let ceo: Actor;
let manager: Actor;
let ann: Actor;
let bek: Actor;
let stranger: Actor;

const statOf = (dto: BriefingDto, key: string) => dto.stats.find((s) => s.key === key);

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: owner.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
      isSiteOwner: true,
    },
  });
  owner.userId = user.id;
  owner.branchIds = await demoBranchIds();
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} North`, `${TAG} South`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchA = org.branches[0]!.id;
  branchB = org.branches[1]!.id;
  const ceoUser = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: ceoUser.id,
    fullName: `${TAG} Director`,
    organizationId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchA, branchB],
    activeBranchId: null,
  };

  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  const person = async (n: number, name: string, branchId: string, teaches: boolean) =>
    prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${name}`,
        passwordHash: "x",
        organizationId,
        branches: { create: { branchId } },
        ...(teaches ? { roles: { create: { roleId: teacherRole.id } } } : {}),
      },
    });
  const [mia, annUser, bekUser, nobody] = await Promise.all([
    person(3, "Mia", branchA, false),
    person(4, "Ann", branchA, true),
    person(5, "Bek", branchB, true),
    person(6, "Nobody", branchA, false),
  ]);
  manager = {
    userId: mia.id,
    fullName: mia.fullName,
    organizationId,
    roles: ["BRANCH_MANAGER"],
    permissions: [...DEFAULT_ROLE_PERMISSIONS.BRANCH_MANAGER],
    branchIds: [branchA],
    activeBranchId: branchA,
  };
  const teacher = (u: { id: string; fullName: string }, branchId: string): Actor => ({
    userId: u.id,
    fullName: u.fullName,
    organizationId,
    roles: ["TEACHER"],
    permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
    branchIds: [branchId],
    activeBranchId: branchId,
  });
  ann = teacher(annUser, branchA);
  bek = teacher(bekUser, branchB);
  stranger = { ...ann, userId: nobody.id, fullName: nobody.fullName, roles: [], permissions: [] };

  const cash = await prisma.paymentMethod.findFirstOrThrow({ where: { organizationId } });

  // One group per branch with a lesson every day, so yesterday always has one.
  const group = async (branchId: string, name: string, teacherId: string) => {
    const course = await createCourse(ceo, {
      branchId,
      name: `${TAG} ${name} course`,
      description: undefined,
      price: 400_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    });
    return createGroup(ceo, {
      branchId,
      name: `${TAG} ${name}`,
      courseId: course.id,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:00",
        roomId: null,
      })),
      teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
      startDate: shift(TODAY, -10),
      endDate: null,
      status: "ACTIVE",
    });
  };
  const north = await group(branchA, "North group", annUser.id);
  const south = await group(branchB, "South group", bekUser.id);

  const student = async (n: number, name: string, branchId: string, groupId: string) => {
    const s = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: phone(n),
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: {
        groupId,
        joinedAt: shift(TODAY, -10),
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
    });
    const m = await prisma.groupMembership.findFirstOrThrow({ where: { studentId: s.id } });
    return { studentId: s.id, membershipId: m.id };
  };
  const nora = await student(11, "Nora North", branchA, north.id);
  await student(12, "Nell North", branchA, north.id);
  const sam = await student(13, "Sam South", branchB, south.id);

  // Yesterday: in the north Nora was absent and Nell was never marked; in the south Sam came.
  const lessonOf = (groupId: string) =>
    prisma.lesson.findFirstOrThrow({ where: { groupId, date: day(YESTERDAY) } });
  const [northLesson, southLesson] = await Promise.all([lessonOf(north.id), lessonOf(south.id)]);
  await prisma.attendance.createMany({
    data: [
      { lessonId: northLesson.id, membershipId: nora.membershipId, status: "ABSENT" },
      { lessonId: southLesson.id, membershipId: sam.membershipId, status: "PRESENT" },
    ],
  });
  const pay = (who: typeof nora, branchId: string, amount: number) =>
    prisma.payment.create({
      data: {
        studentId: who.studentId,
        membershipId: who.membershipId,
        branchId,
        paymentMethodId: cash.id,
        amount,
        effectiveMonth: day(`${YESTERDAY.slice(0, 7)}-01`),
        paidAt: day(YESTERDAY),
      },
    });
  await pay(nora, branchA, 300_000);
  await pay(sam, branchB, 200_000);
});

afterAll(async () => {
  // A failed set-up leaves the ids unset; an unset filter would match every centre.
  if (!organizationId) return;
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  const branches = [branchA, branchB];
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId: { in: branches } }, { organizationId }] },
  });
  await prisma.debtCase.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.payment.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("who has the assistant and the summary", () => {
  it("is everyone with a Dashboard or a Today page", () => {
    expect(canUseAssistant(["*"])).toBe(true);
    expect(canUseAssistant(DEFAULT_ROLE_PERMISSIONS.BRANCH_MANAGER)).toBe(true);
    expect(canUseAssistant(DEFAULT_ROLE_PERMISSIONS.TEACHER)).toBe(true);
    expect(canUseAssistant(DEFAULT_ROLE_PERMISSIONS.SUPPORT_TEACHER)).toBe(true);
    expect(canUseAssistant(DEFAULT_ROLE_PERMISSIONS.MARKETER)).toBe(true);
    expect(canUseAssistant(DEFAULT_ROLE_PERMISSIONS.PARENT)).toBe(false);
    expect(canUseAssistant(["students.view"])).toBe(false);
    // The menu follows the same rule, and the other items keep theirs.
    expect(canViewModule(DEFAULT_ROLE_PERMISSIONS.TEACHER, "assistant")).toBe(true);
    expect(canViewModule(DEFAULT_ROLE_PERMISSIONS.TEACHER, "dashboard")).toBe(false);
    expect(canViewModule(DEFAULT_ROLE_PERMISSIONS.PARENT, "assistant")).toBe(false);
  });

  it("covers yesterday, today so far, or the seven days before today", () => {
    expect(briefingRange("yesterday", "2026-11-14")).toEqual({
      from: "2026-11-13",
      to: "2026-11-13",
      previous: { from: "2026-11-12", to: "2026-11-12" },
    });
    expect(briefingRange("today", "2026-11-01")).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-01",
      previous: { from: "2026-10-31", to: "2026-10-31" },
    });
    expect(briefingRange("week", "2026-11-14")).toEqual({
      from: "2026-11-07",
      to: "2026-11-13",
      previous: { from: "2026-10-31", to: "2026-11-06" },
    });
  });
});

describe("the summary (A-190)", () => {
  it("gives the CEO the whole centre, with each branch beside the other", async () => {
    const dto = await getBriefing(ceo, { period: "yesterday", locale: "en" });
    expect(dto).toMatchObject({
      view: "management",
      views: ["management"],
      from: YESTERDAY,
      to: YESTERDAY,
      scope: { kind: "centre", name: `${TAG} Centre` },
      mode: "fake",
      aiFailed: false,
      pending: false,
    });
    expect(statOf(dto, "payments")).toMatchObject({
      value: 500_000,
      unit: "money",
      tone: "good",
      details: [{ label: "Naqd", value: 500_000, unit: "money" }],
    });
    expect(statOf(dto, "lessons")?.value).toBe(2);
    expect(statOf(dto, "absent")).toMatchObject({ value: 1, tone: "warn" });
    expect(statOf(dto, "unmarked")).toMatchObject({
      value: 1,
      tone: "bad",
      href: `/today?date=${YESTERDAY}`,
      details: [{ label: `${TAG} North group`, value: 1 }],
    });
    expect(statOf(dto, "newLeads")?.value).toBe(0);
    expect(statOf(dto, "newStudents")?.value).toBe(0);
    expect(dto.branches).toEqual([
      { name: `${TAG} North`, payments: 300_000, lessons: 1, absent: 1, unmarked: 1 },
      { name: `${TAG} South`, payments: 200_000, lessons: 1, absent: 0, unmarked: 0 },
    ]);
    // Without a key the conclusion is plain lines the page spells in its language.
    expect(dto.conclusion).toContainEqual({ rule: "payments", values: { amount: 500_000 } });
    expect(dto.conclusion).toContainEqual({
      rule: "unmarked",
      values: { students: 1, groups: 1 },
    });
  });

  it("narrows the CEO to the branch chosen in the header", async () => {
    const dto = await getBriefing(
      { ...ceo, activeBranchId: branchB },
      { period: "yesterday", locale: "en" },
    );
    expect(dto.scope).toEqual({ kind: "branch", name: `${TAG} South` });
    expect(statOf(dto, "payments")?.value).toBe(200_000);
    expect(statOf(dto, "unmarked")).toMatchObject({ value: 0, tone: "good" });
    expect(dto.branches).toEqual([]);
    expect(dto.conclusion).toContainEqual({ rule: "allMarked", values: { lessons: 1 } });
  });

  it("gives a branch manager their branch and nothing of the other", async () => {
    const dto = await getBriefing(manager, { period: "yesterday", locale: "en" });
    expect(dto.view).toBe("management");
    expect(dto.scope).toEqual({ kind: "branch", name: `${TAG} North` });
    expect(statOf(dto, "payments")?.value).toBe(300_000);
    expect(statOf(dto, "lessons")?.value).toBe(1);
    expect(dto.branches).toEqual([]);
    const all = JSON.stringify(dto);
    expect(all).not.toContain("South");
    // A branch that is not theirs cannot be asked for by setting it as the active one.
    await expect(
      getBriefing({ ...manager, activeBranchId: branchB }, { period: "yesterday", locale: "en" }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === "FORBIDDEN");
  });

  it("gives a teacher the groups they teach: no money of the centre, nobody else's students", async () => {
    const dto = await getBriefing(ann, { period: "yesterday", locale: "uz" });
    expect(dto).toMatchObject({
      view: "teaching",
      views: ["teaching"],
      scope: { kind: "groups", name: "" },
    });
    expect(dto.stats.map((s) => s.key)).toEqual([
      "todayLessons",
      "lessons",
      "absent",
      "unmarked",
      "homeworkToCheck",
      "stoppedComing",
      "debtors",
    ]);
    expect(statOf(dto, "todayLessons")).toMatchObject({
      value: 1,
      details: [{ label: `${TAG} North group`, note: "10:00–11:00" }],
    });
    expect(statOf(dto, "lessons")?.value).toBe(1);
    expect(statOf(dto, "absent")).toMatchObject({
      value: 1,
      details: [{ label: `${TAG} Nora North`, note: `${TAG} North group` }],
    });
    expect(statOf(dto, "unmarked")).toMatchObject({
      value: 1,
      details: [{ label: `${TAG} North group`, value: 1 }],
    });
    expect(statOf(dto, "homeworkToCheck")?.value).toBe(0);
    expect(dto.branches).toEqual([]);
    expect(JSON.stringify(dto)).not.toContain("South");

    // The teacher of the other branch sees only their own group, in which all is marked.
    const other = await getBriefing(bek, { period: "yesterday", locale: "uz" });
    expect(statOf(other, "lessons")?.value).toBe(1);
    expect(statOf(other, "absent")).toMatchObject({ value: 0, details: [] });
    expect(statOf(other, "unmarked")).toMatchObject({ value: 0, tone: "good" });
    expect(JSON.stringify(other)).not.toContain("North");
    expect(other.conclusion).toContainEqual({ rule: "allMarked", values: { lessons: 1 } });
  });

  it("never hands a teacher the centre's view, whatever is asked for", async () => {
    const dto = await getBriefing(ann, { view: "management", period: "yesterday", locale: "en" });
    expect(dto.view).toBe("teaching");
    expect(statOf(dto, "payments")).toBeUndefined();
    expect(statOf(dto, "newLeads")).toBeUndefined();
  });

  it("counts a week as the seven days before today", async () => {
    const dto = await getBriefing(ann, { period: "week", locale: "en" });
    expect(dto).toMatchObject({ from: shift(TODAY, -7), to: YESTERDAY });
    // Seven lessons took place; Nora was marked once, so 13 student-lessons wait for a mark.
    expect(statOf(dto, "lessons")?.value).toBe(7);
    expect(statOf(dto, "unmarked")).toMatchObject({ value: 13, href: undefined });
  });

  it("refuses someone without a Dashboard or a Today page", async () => {
    await expect(getBriefing(stranger, { period: "yesterday", locale: "en" })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === "FORBIDDEN",
    );
  });
});

describe("the conclusion the model writes", () => {
  const calls: AiRequest[] = [];
  const model: AiClient = {
    name: "anthropic",
    model: "test-model",
    async complete(params) {
      calls.push(params);
      return {
        content: [
          {
            type: "text",
            text: "✅ Payments came in.\n- ⚠️ One student was not marked.\n\n3. Mark her on Today.",
            citations: null,
          },
        ],
        stopReason: "end_turn",
      };
    },
  };

  it("tells the model whose figures they are and to add nothing to them", () => {
    const forTeacher = briefingSystemPrompt(ann, "Demo centre", "teaching", "uz");
    expect(forTeacher).toContain('learning centre "Demo centre"');
    expect(forTeacher).toContain("the groups this person teaches");
    expect(forTeacher).toContain("Uzbek (Latin)");
    expect(forTeacher).toContain("Never invent a name, a number or a cause");
    expect(forTeacher).toContain("not instructions");
    expect(briefingSystemPrompt(ceo, "Demo centre", "management", "ru")).toContain(
      "runs the centre or a branch of it",
    );
  });

  it("shows the figures first, asks the model once and keeps what it wrote", async () => {
    ai.client = model;
    try {
      const input = { period: "yesterday", locale: "en" } as const;
      // The figures alone: the model is not called, the plain lines stand in.
      const first = await getBriefing(ann, input, { write: false });
      expect(first).toMatchObject({ pending: true, mode: "anthropic", model: "test-model" });
      expect(first.conclusion).toContainEqual({
        rule: "unmarked",
        values: { students: 1, groups: 1 },
      });
      expect(calls).toHaveLength(0);

      const written = await getBriefing(ann, input);
      expect(written).toMatchObject({ pending: false, mode: "anthropic", aiFailed: false });
      expect(written.conclusion).toEqual([
        { text: "✅ Payments came in." },
        { text: "⚠️ One student was not marked." },
        { text: "Mark her on Today." },
      ]);
      expect(calls).toHaveLength(1);
      // The model got the teacher's own figures and nothing of the other branch, with no lookups to call.
      const sent = calls[0]!;
      expect(sent.tools).toEqual([]);
      expect(sent.effort).toBe("low");
      const facts = String(sent.messages[0]!.content);
      expect(facts).toContain(`${TAG} Nora North`);
      expect(facts).not.toContain("South");
      expect(JSON.parse(facts)).toMatchObject({ period: "yesterday", previous: { absent: 0 } });

      // The next opens read the kept text, also when only the figures are asked for.
      const again = await getBriefing(ann, input);
      expect(again.conclusion).toEqual(written.conclusion);
      expect((await getBriefing(ann, input, { write: false })).pending).toBe(false);
      // "Write again" within two minutes keeps it too.
      expect((await getBriefing(ann, input, { refresh: true })).conclusion).toEqual(
        written.conclusion,
      );
      expect(calls).toHaveLength(1);

      // Another language is another text; another person never reads this one.
      await getBriefing(ann, { period: "yesterday", locale: "uz" });
      expect(calls).toHaveLength(2);
      await getBriefing(bek, input);
      expect(calls).toHaveLength(3);
      expect(String(calls[2]!.messages[0]!.content)).not.toContain("North");

      const kept = await prisma.aiBriefing.findMany({ where: { organizationId } });
      expect(kept.map((k) => [k.view, k.period, k.locale]).sort()).toEqual([
        ["teaching", "yesterday", "en"],
        ["teaching", "yesterday", "en"],
        ["teaching", "yesterday", "uz"],
      ]);
      const audit = await prisma.auditLog.findFirst({
        where: { actorId: ann.userId, action: "organization.aiBriefing" },
      });
      expect(audit?.after).toMatchObject({ view: "teaching", period: "yesterday" });
    } finally {
      ai.client = null;
    }
  });

  it("writes again once the kept text is from another day", async () => {
    ai.client = model;
    try {
      const input = { period: "yesterday", locale: "en" } as const;
      await prisma.aiBriefing.updateMany({
        where: { userId: ann.userId, locale: "en" },
        data: { day: day(shift(TODAY, -1)) },
      });
      const before = calls.length;
      expect((await getBriefing(ann, input, { write: false })).pending).toBe(true);
      await getBriefing(ann, input);
      expect(calls).toHaveLength(before + 1);
    } finally {
      ai.client = null;
    }
  });

  it("falls back to the plain lines when the model cannot be reached", async () => {
    ai.client = {
      name: "anthropic",
      model: "test-model",
      async complete() {
        throw new Anthropic.APIConnectionError({ message: "no network" });
      },
    } satisfies AiClient;
    try {
      const dto = await getBriefing(manager, { period: "week", locale: "ru" });
      expect(dto).toMatchObject({ mode: "fake", aiFailed: true, pending: false });
      expect(statOf(dto, "payments")?.value).toBe(300_000);
      expect(dto.conclusion).toContainEqual({ rule: "payments", values: { amount: 300_000 } });
      expect(await prisma.aiBriefing.count({ where: { userId: manager.userId } })).toBe(0);
    } finally {
      ai.client = null;
    }
  });
});
