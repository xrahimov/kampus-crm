import type Anthropic from "@anthropic-ai/sdk";

import type { AssistantAskInput } from "@/lib/validation/ai";
import { DEBT_SORT_FIELDS } from "@/lib/validation/debts";
import { GROUP_SORT_FIELDS } from "@/lib/validation/groups";
import { STUDENT_SORT_FIELDS } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError, isAppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { getDashboardKpis } from "@/server/services/dashboard/kpis.service";
import { getDashboardSchedule } from "@/server/services/dashboard/schedule.service";
import { listDebtCases } from "@/server/services/debts/debts.service";
import { listGroups } from "@/server/services/groups/groups.service";
import { today } from "@/server/services/groups/shared";
import { getAiClient } from "@/server/services/integrations/integrations.service";
import { getPaymentsReport } from "@/server/services/reports/payments-report.service";
import { listStudents } from "@/server/services/students/students.service";

/*
 * The AI assistant (round 2 item G4, A-149). A staff member asks in plain
 * words; the model answers with read-only tools that wrap the existing
 * services and run as the asking user, so every permission rule of the
 * screens holds and nothing is ever written.
 */

export interface AssistantAnswerDto {
  answer: string;
  /** Which lookups the answer rests on, for the small "Looked at" line. */
  tools: string[];
  mode: "fake" | "anthropic";
  model: string;
}

const MAX_TOOL_ROUNDS = 6;
const LIST_LIMIT = 25;

const list = <F extends string>(field: F, take = LIST_LIMIT): ParsedList<F> => ({
  page: 1,
  pageSize: take,
  skip: 0,
  take,
  sort: { field, direction: "desc" },
});

const tools: Anthropic.Tool[] = [
  {
    name: "list_debtors",
    description:
      "Students who owe the centre money right now, largest debt first: name, phone, branch, groups, amount owed in so'm, days overdue, promises and last contact.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "How many, default 25" },
        branchId: { type: "string", description: "Only this branch id" },
      },
    },
  },
  {
    name: "search_students",
    description:
      "Find students by name or phone. Returns name, phone, balance (negative = owes), groups with teacher, next payment date.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Part of a name or phone number" },
        groupStatus: {
          type: "string",
          enum: ["ACTIVE", "FROZEN", "FINISHED", "NEW"],
          description: "Only students whose group has this status",
        },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: "count_students",
    description:
      "How many non-archived students the centre has and how many of them are in groups, plus teachers, groups, debtors, open leads and this month's new admissions.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "dashboard_kpis",
    description:
      "The dashboard numbers: active students, groups, teachers, debtors and remaining debt, trial students, students who left this month, exams, room utilisation.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "payments_summary",
    description:
      "Student payments for one month: totals of paid, paid on time, paid late, discounts, bonuses and refunds, with per-teacher rows. Defaults to the current month.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 2020, maximum: 2100 },
        month: { type: "integer", minimum: 1, maximum: 12 },
        branchId: { type: "string" },
      },
    },
  },
  {
    name: "todays_schedule",
    description:
      "Lessons on a weekday as the schedule grid: rooms with their lesson blocks (group, course, teacher, start and end). Defaults to today.",
    input_schema: {
      type: "object",
      properties: {
        weekday: {
          type: "integer",
          minimum: 1,
          maximum: 7,
          description: "1 = Monday … 7 = Sunday",
        },
        branchId: { type: "string" },
      },
    },
  },
  {
    name: "list_groups",
    description:
      "Groups with course, teachers, schedule, student count and status; by default the active ones.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Part of the group or course name" },
        status: {
          type: "string",
          enum: ["ACTIVE", "FROZEN", "FINISHED", "NEW", "ARCHIVED", "ALL"],
        },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
  },
];

type ToolInput = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const int = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(Math.max(1, Math.round(v)), max)
    : undefined;

/** Runs one tool as the actor; a missing permission or a bad input is reported to the model, not thrown. */
async function runTool(
  actor: Actor,
  name: string,
  input: ToolInput,
  db: DbClient,
): Promise<string> {
  try {
    switch (name) {
      case "list_debtors": {
        const page = await listDebtCases(
          actor,
          { ...list(DEBT_SORT_FIELDS[0], int(input.limit, 50) ?? LIST_LIMIT) },
          { branchId: str(input.branchId), status: "ACTIVE" },
          db,
        );
        return JSON.stringify({
          totalDebtors: page.total,
          summary: page.summary,
          debtors: page.items.map((d) => ({
            student: d.studentName,
            phone: d.phone,
            parentPhone: d.parentPhone,
            branch: d.branchName,
            groups: d.groups.map((g) => g.groupName),
            owes: d.amount,
            daysOverdue: d.daysOverdue,
            promisedAt: d.promisedAt,
            lastContactAt: d.lastContactAt,
          })),
        });
      }
      case "search_students": {
        const page = await listStudents(
          actor,
          { ...list(STUDENT_SORT_FIELDS[0], int(input.limit, 50) ?? LIST_LIMIT), q: str(input.q) },
          {
            groupStatus: ["ACTIVE", "FROZEN", "FINISHED", "NEW"].includes(String(input.groupStatus))
              ? (input.groupStatus as "ACTIVE")
              : undefined,
          },
          db,
        );
        return JSON.stringify({
          total: page.total,
          students: page.items.map((s) => ({
            name: s.fullName,
            phone: s.phone,
            balance: s.balance,
            nextPaymentDate: s.nextPaymentDate,
            groups: s.groups.map((g) => ({
              name: g.groupName,
              teacher: g.teacherName,
              status: g.status,
            })),
          })),
        });
      }
      case "count_students":
      case "dashboard_kpis": {
        const kpis = await getDashboardKpis(actor, {}, db);
        return JSON.stringify(kpis);
      }
      case "payments_summary": {
        const now = today();
        const report = await getPaymentsReport(
          actor,
          {
            year: int(input.year, 2100) ?? Number(now.slice(0, 4)),
            month: int(input.month, 12) ?? Number(now.slice(5, 7)),
            branchId: str(input.branchId),
          },
          db,
        );
        return JSON.stringify({
          year: report.year,
          month: report.month,
          kpis: report.kpis,
          teachers: report.teachers.slice(0, LIST_LIMIT),
        });
      }
      case "todays_schedule": {
        const grid = await getDashboardSchedule(
          actor,
          { weekday: int(input.weekday, 7), branchId: str(input.branchId), step: 60 },
          db,
        );
        return JSON.stringify({
          weekday: grid.weekday,
          rooms: grid.rooms.map((r) => ({
            room: r.name,
            lessons: r.blocks.map((b) => ({
              group: b.groupName,
              course: b.courseName,
              teacher: b.teacherName,
              time: `${b.startTime}–${b.endTime}`,
            })),
          })),
          withoutRoom: grid.unassigned.map((b) => ({
            group: b.groupName,
            teacher: b.teacherName,
            time: `${b.startTime}–${b.endTime}`,
          })),
        });
      }
      case "list_groups": {
        const status = String(input.status ?? "");
        const page = await listGroups(
          actor,
          { ...list(GROUP_SORT_FIELDS[0], int(input.limit, 50) ?? LIST_LIMIT), q: str(input.q) },
          {
            status: ["ACTIVE", "FROZEN", "FINISHED", "NEW", "ARCHIVED", "ALL"].includes(status)
              ? (status as "ACTIVE")
              : undefined,
          },
          db,
        );
        return JSON.stringify({
          total: page.total,
          groups: page.items.map((g) => ({
            name: g.name,
            course: g.courseName,
            status: g.status,
            teachers: g.teachers.map((t) => t.fullName),
            students: g.activeStudents,
            startDate: g.startDate,
            endDate: g.endDate,
          })),
        });
      }
      default:
        return `Unknown tool ${name}.`;
    }
  } catch (error) {
    if (isAppError(error) && error.code === "FORBIDDEN") {
      return "Not permitted: the asking user's role may not see this data.";
    }
    if (isAppError(error)) return `Could not look this up: ${error.message}`;
    throw error;
  }
}

function systemPrompt(actor: Actor, centre: string, locale: string): string {
  const language = { uz: "Uzbek (Latin)", ru: "Russian", en: "English" }[locale] ?? "English";
  return [
    `You are the assistant inside Kampus, the CRM of the learning centre "${centre}".`,
    `You are talking to ${actor.fullName} (roles: ${actor.roles.join(", ") || "staff"}). Today is ${today()} (Tashkent).`,
    `Answer in ${language} unless the person writes in another language; then answer in theirs.`,
    "Use the tools for every fact about students, debts, payments, groups and lessons; never invent names or numbers. If a tool says the data is not permitted, say so plainly.",
    "Money is in Uzbek so'm; write amounts with thousands separators. Keep answers short and concrete: a few sentences or a compact list. Draft messages (SMS, Telegram) when asked, in the language the recipient would read.",
    "You cannot change anything in Kampus; point the person to the right screen (Students, Debtors, Cash desk, Groups, Reports) for actions.",
  ].join("\n");
}

/** One answer to a conversation; the model may call tools up to MAX_TOOL_ROUNDS times. */
export async function askAssistant(
  actor: Actor,
  input: AssistantAskInput,
  locale = "en",
  db: DbClient = prisma,
): Promise<AssistantAnswerDto> {
  authorize(actor, "dashboard.view");
  if (input.messages.at(-1)?.role !== "user")
    throw AppError.validation({ messages: ["validation.required"] });
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { name: true },
  });
  const client = await getAiClient(db, actor.organizationId);
  const messages: Anthropic.MessageParam[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const used: string[] = [];
  let answer = "";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const result = await client.complete({
      system: systemPrompt(actor, org.name, locale),
      messages,
      tools,
    });
    if (result.stopReason === "refusal") throw AppError.conflict("errors.assistantRefused");
    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const calls = result.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (calls.length === 0 || round === MAX_TOOL_ROUNDS) {
      answer = text;
      break;
    }
    messages.push({ role: "assistant", content: result.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      used.push(call.name);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: await runTool(actor, call.name, (call.input ?? {}) as ToolInput, db),
      });
    }
    // All results of one round go back in a single user message.
    messages.push({ role: "user", content: results });
  }
  if (!answer) throw AppError.conflict("errors.assistantFailed");
  const question = input.messages.at(-1)!.content;
  await recordAudit(db, actor, {
    action: "organization.aiAsk",
    entity: "Organization",
    entityId: actor.organizationId,
    after: { question: question.slice(0, 200), tools: [...new Set(used)], mode: client.name },
    branchId: actor.activeBranchId,
  });
  return { answer, tools: [...new Set(used)], mode: client.name, model: client.model };
}
