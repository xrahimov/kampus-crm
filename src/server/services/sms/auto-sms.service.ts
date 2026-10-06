import {
  AUTO_SMS_EVENTS,
  type AutoSmsEvent,
  type AutoSmsSettingsInput,
  type SmsVariable,
} from "@/lib/validation/integrations";
import { formatMoneyUz } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { enqueue } from "@/server/jobs/queue";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { dateToIso, getOrganizationId, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";

/* "AUTO SMS SOZLAMALARI" (EXP §8 General settings): ten switches with templates. A-88. */

export type SmsVars = Partial<Record<SmsVariable, string>>;

/** Default texts, in Uzbek like the reference; variables are `{name}` placeholders. */
export const DEFAULT_AUTO_SMS: Record<AutoSmsEvent, string> = {
  BIRTHDAY:
    "Hurmatli {studentName}, {centerName} jamoasi sizni tug'ilgan kuningiz bilan tabriklaydi!",
  EXAM_RESULT: "{studentName}, {groupName} guruhidagi imtihon natijangiz: {score}. {centerName}",
  PAYMENT_MADE: "{studentName}, {date} kuni {amount} to'lovingiz qabul qilindi. {centerName}",
  ABSENT: "{studentName} {date} kuni {groupName} guruhidagi darsga kelmadi. {centerName}",
  PRESENT: "{studentName} {date} kuni {groupName} guruhidagi darsga keldi. {centerName}",
  PAYMENT_DUE_SOON:
    "{studentName}, {groupName} guruhi uchun keyingi to'lov sanasi {date}. {centerName}",
  DEBTOR: "{studentName}, {groupName} guruhi bo'yicha qarzdorligingiz {debt}. {centerName}",
  GRADES: "{studentName}, {date} kuni {groupName} guruhidagi bahoingiz: {score}. {centerName}",
  DAY_BEFORE_FIRST_LESSON:
    "{studentName}, {groupName} guruhidagi birinchi dars ertaga, {date}. {centerName}",
  ADDED_TO_GROUP: "{studentName}, siz {groupName} guruhiga qo'shildingiz. {centerName}",
};

/** Which variables each event's template may use (shown as chips in the settings). */
export const AUTO_SMS_VARIABLES: Record<AutoSmsEvent, SmsVariable[]> = {
  BIRTHDAY: ["studentName", "centerName"],
  EXAM_RESULT: ["studentName", "groupName", "score", "date", "centerName"],
  PAYMENT_MADE: ["studentName", "groupName", "amount", "date", "centerName"],
  ABSENT: ["studentName", "groupName", "date", "centerName"],
  PRESENT: ["studentName", "groupName", "date", "centerName"],
  PAYMENT_DUE_SOON: ["studentName", "groupName", "date", "amount", "centerName"],
  DEBTOR: ["studentName", "groupName", "debt", "date", "centerName"],
  GRADES: ["studentName", "groupName", "score", "date", "centerName"],
  DAY_BEFORE_FIRST_LESSON: ["studentName", "groupName", "date", "centerName"],
  ADDED_TO_GROUP: ["studentName", "groupName", "centerName"],
};

export interface AutoSmsSettingDto {
  event: AutoSmsEvent;
  isActive: boolean;
  template: string;
  variables: SmsVariable[];
}

export function renderTemplate(template: string, vars: SmsVars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? (vars[key as SmsVariable] ?? "") : match,
  );
}

async function ensureSettings(db: DbClient, organizationId: string) {
  const rows = await db.autoSmsSetting.findMany({ where: { organizationId } });
  const have = new Set(rows.map((r) => r.event));
  const missing = AUTO_SMS_EVENTS.filter((e) => !have.has(e));
  if (missing.length > 0) {
    await db.autoSmsSetting.createMany({
      data: missing.map((event) => ({
        organizationId,
        event,
        template: DEFAULT_AUTO_SMS[event],
        isActive: false,
      })),
    });
    return db.autoSmsSetting.findMany({ where: { organizationId } });
  }
  return rows;
}

function toDtos(rows: Array<{ event: AutoSmsEvent; isActive: boolean; template: string }>) {
  const byEvent = new Map(rows.map((r) => [r.event, r]));
  return AUTO_SMS_EVENTS.map((event) => {
    const row = byEvent.get(event);
    return {
      event,
      isActive: row?.isActive ?? false,
      template: row?.template ?? DEFAULT_AUTO_SMS[event],
      variables: AUTO_SMS_VARIABLES[event],
    };
  });
}

export async function getAutoSmsSettings(
  actor: Actor,
  db: DbClient = prisma,
): Promise<AutoSmsSettingDto[]> {
  authorize(actor, "settings.org");
  const organizationId = await getOrganizationId(db);
  return toDtos(await ensureSettings(db, organizationId));
}

export async function updateAutoSmsSettings(
  actor: Actor,
  input: AutoSmsSettingsInput,
  db: DbClient = prisma,
): Promise<AutoSmsSettingDto[]> {
  authorize(actor, "settings.org");
  const organizationId = await getOrganizationId(db);
  return db.$transaction(async (tx) => {
    const before = toDtos(await ensureSettings(tx, organizationId));
    for (const s of input.settings) {
      await tx.autoSmsSetting.update({
        where: { organizationId_event: { organizationId, event: s.event } },
        data: { isActive: s.isActive, template: s.template },
      });
    }
    const after = toDtos(await tx.autoSmsSetting.findMany({ where: { organizationId } }));
    await recordAudit(tx, actor, {
      action: "settings.autoSms.update",
      entity: "Organization",
      entityId: organizationId,
      before: before.map(({ event, isActive }) => ({ event, isActive })),
      after: after.map(({ event, isActive }) => ({ event, isActive })),
      branchId: null,
    });
    return after;
  });
}

/* ----- firing ------------------------------------------------------------------------------ */

/**
 * Queues one automatic SMS if its switch is on and the student has a phone.
 * Idempotent on `refKey`. Call it inside the transaction of the event so a
 * rolled-back change never leaves a message behind.
 */
export async function queueAutoSms(
  tx: DbClient,
  input: {
    event: AutoSmsEvent;
    studentId: string;
    refKey: string;
    vars?: SmsVars;
    /** Who the message is about when it goes to the parents too; v1 texts the student (A-88). */
  },
): Promise<boolean> {
  const organizationId = await getOrganizationId(tx);
  const setting = await tx.autoSmsSetting.findUnique({
    where: { organizationId_event: { organizationId, event: input.event } },
  });
  if (!setting?.isActive) return false;
  const existing = await tx.smsMessage.findUnique({ where: { refKey: input.refKey } });
  if (existing) return false;
  const [student, org] = await Promise.all([
    tx.student.findUnique({
      where: { id: input.studentId },
      select: { fullName: true, phone: true, branchId: true, isArchived: true },
    }),
    tx.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);
  if (!student || !student.phone || student.isArchived) return false;
  const text = renderTemplate(setting.template, {
    studentName: student.fullName,
    centerName: org?.name ?? "",
    date: dateToIso(new Date()),
    ...input.vars,
  });
  const message = await tx.smsMessage.create({
    data: {
      organizationId,
      branchId: student.branchId,
      recipientType: "STUDENT",
      recipientName: student.fullName,
      phone: student.phone,
      studentId: input.studentId,
      text,
      status: "QUEUED",
      event: input.event,
      refKey: input.refKey,
    },
  });
  await enqueue(tx, { type: "sms.send", payload: { messageId: message.id } });
  return true;
}

const LEFT = ["ARCHIVED", "GRADUATED"] as const;
const DUE_SOON_DAYS = 3;

function addDaysIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

/**
 * The daily scan (job `auto-sms.daily`): birthdays (SMS and the "Tug'ilgan kun"
 * coins, A-79), the day before a group's first lesson, payments due soon and
 * new debtors. Safe to run more than once a day thanks to the ref keys.
 */
export async function runDailyAutoSms(
  db: DbClient,
  todayIso: string = dateToIso(new Date()),
): Promise<{ queued: number }> {
  let queued = 0;
  const today = isoToDate(todayIso);
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const year = today.getUTCFullYear();

  // Birthdays: compare month and day in SQL, since @db.Date columns hold UTC midnight.
  const birthdays = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Student"
    WHERE "isArchived" = false AND "birthDate" IS NOT NULL
      AND EXTRACT(MONTH FROM "birthDate") = ${month}
      AND EXTRACT(DAY FROM "birthDate") = ${day}`;
  for (const s of birthdays) {
    await db.$transaction(async (tx) => {
      if (
        await queueAutoSms(tx, {
          event: "BIRTHDAY",
          studentId: s.id,
          refKey: `birthday:${s.id}:${year}`,
        })
      ) {
        queued += 1;
      }
      await awardAutoCoins(tx, {
        event: "BIRTHDAY",
        studentId: s.id,
        groupId: null,
        refKey: `birthday:${s.id}:${year}`,
      });
    });
  }

  // Day before the first lesson: groups whose earliest lesson is tomorrow.
  const tomorrow = isoToDate(addDaysIso(todayIso, 1));
  const firstLessons = await db.lesson.groupBy({
    by: ["groupId"],
    _min: { date: true },
    having: { date: { _min: { equals: tomorrow } } },
  });
  for (const g of firstLessons) {
    const group = await db.group.findUnique({
      where: { id: g.groupId },
      select: {
        name: true,
        memberships: { where: { status: { notIn: [...LEFT] } }, select: { studentId: true } },
      },
    });
    if (!group) continue;
    for (const m of group.memberships) {
      const ok = await db.$transaction((tx) =>
        queueAutoSms(tx, {
          event: "DAY_BEFORE_FIRST_LESSON",
          studentId: m.studentId,
          refKey: `firstLesson:${g.groupId}:${m.studentId}`,
          vars: { groupName: group.name, date: addDaysIso(todayIso, 1) },
        }),
      );
      if (ok) queued += 1;
    }
  }

  // Debtors and payments due soon, from the same balance engine the profile uses (A-59).
  const organizationId = await getOrganizationId(db);
  const switches = await db.autoSmsSetting.findMany({
    where: { organizationId, event: { in: ["DEBTOR", "PAYMENT_DUE_SOON"] }, isActive: true },
  });
  if (switches.length > 0) {
    const active = await db.groupMembership.findMany({
      where: { status: "ACTIVE", group: { status: "ACTIVE" } },
      select: { id: true, studentId: true, group: { select: { name: true } } },
    });
    const balances = await membershipBalances(
      db,
      active.map((m) => m.id),
    );
    const wantDebtor = switches.some((s) => s.event === "DEBTOR");
    const wantDueSoon = switches.some((s) => s.event === "PAYMENT_DUE_SOON");
    for (const m of active) {
      const b = balances.get(m.id);
      if (!b) continue;
      if (wantDebtor && b.balance < 0) {
        const ok = await db.$transaction(async (tx) => {
          // The same monthly debtor notice also goes to the student's Telegram (A-103).
          await notifyStudents(tx, {
            studentIds: [m.studentId],
            kind: "debtor",
            refKey: `debtor:${m.id}:${todayIso.slice(0, 7)}`,
            values: { group: m.group.name, debt: formatMoneyUz(Math.abs(b.balance)) },
          });
          return queueAutoSms(tx, {
            event: "DEBTOR",
            studentId: m.studentId,
            refKey: `debtor:${m.id}:${todayIso.slice(0, 7)}`,
            vars: { groupName: m.group.name, debt: String(Math.abs(b.balance)) },
          });
        });
        if (ok) queued += 1;
      } else if (
        wantDueSoon &&
        b.nextPaymentDate &&
        b.nextPaymentDate > todayIso &&
        b.nextPaymentDate <= addDaysIso(todayIso, DUE_SOON_DAYS)
      ) {
        const ok = await db.$transaction((tx) =>
          queueAutoSms(tx, {
            event: "PAYMENT_DUE_SOON",
            studentId: m.studentId,
            refKey: `dueSoon:${m.id}:${b.nextPaymentDate}`,
            vars: {
              groupName: m.group.name,
              date: b.nextPaymentDate ?? "",
              amount: String(b.suggestedAmount),
            },
          }),
        );
        if (ok) queued += 1;
      }
    }
  }
  return { queued };
}
