/**
 * The AI assistant (A-149) against the real database with the built-in test
 * client: a question about debt runs the debtors tool as the asker, a teacher
 * without the permission is told so, a drafting request needs no tool, the
 * conversation must end with the user's turn, and the question is audited.
 */
import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { askAssistant } from "@/server/services/ai/assistant.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `ai${RUN}`;

const ceo: Actor = {
  userId: "",
  fullName: `${TAG} CEO`,
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};
let teacher: Actor;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `+99896${RUN}01`,
      fullName: ceo.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  ceo.branchIds = await demoBranchIds();
  const teacherUser = await prisma.user.create({
    data: {
      phone: `+99896${RUN}02`,
      fullName: `${TAG} Teacher`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  teacher = {
    userId: teacherUser.id,
    fullName: `${TAG} Teacher`,
    organizationId: DEMO_ORG_ID,
    roles: ["TEACHER"],
    permissions: ["dashboard.view", "groups.view", "students.view"],
    branchIds: ceo.branchIds,
    activeBranchId: ceo.branchIds[0] ?? null,
  };
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [ceo.userId, teacher.userId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ceo.userId, teacher.userId] } } });
  await prisma.$disconnect();
});

describe("the assistant", () => {
  it("answers a question about debt from the debtors tool and audits the question", async () => {
    const dto = await askAssistant(ceo, {
      messages: [{ role: "user", content: "Who owes money right now?" }],
      locale: "en",
    });
    expect(dto.mode).toBe("fake");
    expect(dto.tools).toEqual(["list_debtors"]);
    expect(dto.answer).toContain("totalDebtors");
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: ceo.userId, action: "organization.aiAsk" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ tools: ["list_debtors"], mode: "fake" });
  });

  it("tells a teacher that debtors are not theirs to see, but counts students", async () => {
    const debt = await askAssistant(teacher, {
      messages: [{ role: "user", content: "Who owes money?" }],
      locale: "en",
    });
    expect(debt.tools).toEqual(["list_debtors"]);
    expect(debt.answer).toContain("Not permitted");
    const students = await askAssistant(teacher, {
      messages: [{ role: "user", content: "How many active students do we have?" }],
      locale: "uz",
    });
    expect(students.tools).toEqual(["count_students"]);
    expect(students.answer).toContain("activeStudents");
  });

  it("drafts a message without any lookup and keeps the conversation", async () => {
    const dto = await askAssistant(ceo, {
      messages: [
        { role: "user", content: "Who owes money?" },
        { role: "assistant", content: "Two students owe money." },
        { role: "user", content: "Draft a short SMS reminding a parent about the unpaid month." },
      ],
      locale: "en",
    });
    expect(dto.tools).toEqual([]);
    expect(dto.answer).toMatch(/^Draft:/);
  });

  it("refuses a conversation that does not end with the user's turn", async () => {
    await expect(
      askAssistant(ceo, {
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
        locale: "en",
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === "VALIDATION");
  });
});
