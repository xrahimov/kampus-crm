import { z } from "zod";

import { idSchema, phoneSchema } from "./common";
import { dateOnlySchema, timeSchema } from "./settings";
import { studentFilterSchema } from "./students";

/* Phase 11: SMS, auto-SMS, calls, Telegram bot, integrations, staff attendance (EXP §8, §10). */

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const optionalId = z.union([z.literal("").transform(() => null), z.null(), idSchema]).optional();
const optionalDate = z
  .union([z.literal("").transform(() => null), z.null(), dateOnlySchema])
  .optional();

/** One SMS part holds 160 GSM-7 or 70 UCS-2 characters; the counter follows the reference. */
export const SMS_MAX_LENGTH = 1000;
export const smsTextSchema = z
  .string()
  .trim()
  .min(1, "validation.required")
  .max(SMS_MAX_LENGTH, "validation.tooLong");

export const smsCategorySchema = z.object({ name });
export type SmsCategoryInput = z.infer<typeof smsCategorySchema>;

export const smsTemplateSchema = z.object({
  categoryId: idSchema,
  text: smsTextSchema,
});
export type SmsTemplateInput = z.infer<typeof smsTemplateSchema>;

export const AUTO_SMS_EVENTS = [
  "BIRTHDAY",
  "EXAM_RESULT",
  "PAYMENT_MADE",
  "ABSENT",
  "PRESENT",
  "PAYMENT_DUE_SOON",
  "DEBTOR",
  "GRADES",
  "DAY_BEFORE_FIRST_LESSON",
  "ADDED_TO_GROUP",
  "LESSON_CANCELLED",
  "LESSON_MOVED",
  "LESSON_RESTORED",
] as const;
export type AutoSmsEvent = (typeof AUTO_SMS_EVENTS)[number];

/** Template variables, written as `{name}` in the text (EXP §8: Talaba ismi, To'lov sanasi, …). */
export const SMS_VARIABLES = [
  "studentName",
  "groupName",
  "date",
  "amount",
  "debt",
  "score",
  "centerName",
  "time",
  "newDate",
  "newTime",
  "reason",
] as const;
export type SmsVariable = (typeof SMS_VARIABLES)[number];

export const autoSmsSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        event: z.enum(AUTO_SMS_EVENTS),
        isActive: z.boolean(),
        template: smsTextSchema,
      }),
    )
    .min(1),
});
export type AutoSmsSettingsInput = z.infer<typeof autoSmsSettingsSchema>;

/** Who a bulk or single SMS goes to (EXP: SMS YUBORISH buttons, column SMS, parents, student). */
export const smsTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("student"), studentId: idSchema }),
  z.object({ kind: z.literal("parents"), studentId: idSchema }),
  z.object({
    kind: z.literal("students"),
    studentIds: z.array(idSchema).min(1, "validation.required").max(2000),
  }),
  /** Students page "SMS YUBORISH": everyone matching the current filters (A-84). */
  studentFilterSchema.extend({
    kind: z.literal("studentFilter"),
    q: z.string().trim().max(200).optional(),
  }),
  z.object({ kind: z.literal("group"), groupId: idSchema }),
  z.object({ kind: z.literal("staff"), userIds: z.array(idSchema).min(1).max(500) }),
  z.object({ kind: z.literal("teachers"), archived: z.boolean().default(false) }),
  z.object({ kind: z.literal("leadColumn"), columnId: idSchema }),
]);
export type SmsTarget = z.infer<typeof smsTargetSchema>;

export const sendSmsSchema = z.object({
  target: smsTargetSchema,
  text: smsTextSchema,
});
export type SendSmsInput = z.infer<typeof sendSmsSchema>;

export const SMS_STATUSES = ["QUEUED", "SENT", "FAILED"] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];
export const SMS_RECIPIENT_TYPES = ["STUDENT", "PARENT", "STAFF", "LEAD", "OTHER"] as const;
export type SmsRecipientType = (typeof SMS_RECIPIENT_TYPES)[number];

export const smsLogFilterSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  status: z.enum(SMS_STATUSES).optional(),
  /** "system" = Dastur tomonidan jo'natildi, otherwise a staff id. */
  sentBy: z.string().max(64).optional(),
});
export type SmsLogFilters = z.infer<typeof smsLogFilterSchema>;

export const CALL_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];
export const CALL_STATUSES = ["ANSWERED", "MISSED", "BUSY", "FAILED"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const callFilterSchema = z.object({
  direction: z.enum(CALL_DIRECTIONS).optional(),
  status: z.enum(CALL_STATUSES).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type CallFilters = z.infer<typeof callFilterSchema>;

/** Click-to-call from a student profile (A-86). */
export const startCallSchema = z.object({ phone: phoneSchema });

/** What a telephony provider posts to `/webhooks/telephony` (generic shape, A-86). */
export const telephonyWebhookSchema = z.object({
  externalId: z.string().min(1).max(120),
  direction: z.enum(CALL_DIRECTIONS),
  status: z.enum(CALL_STATUSES),
  from: z.string().min(3).max(32),
  to: z.string().min(3).max(32),
  durationSeconds: z.coerce.number().int().min(0).default(0),
  startedAt: z.string().datetime({ offset: true }),
  recordingUrl: z.string().url().max(500).optional(),
});
export type TelephonyWebhookInput = z.infer<typeof telephonyWebhookSchema>;

/** What a FaceID terminal posts to `/webhooks/face-id` (A-87). */
export const faceIdWebhookSchema = z.object({
  deviceId: z.string().min(1).max(120),
  /** The staff member's phone as enrolled on the device. */
  phone: phoneSchema,
  at: z.string().datetime({ offset: true }),
  kind: z.enum(["IN", "OUT"]).default("IN"),
});
export type FaceIdWebhookInput = z.infer<typeof faceIdWebhookSchema>;

export const loginLogFilterSchema = z.object({
  success: z.enum(["true", "false"]).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type LoginLogFilters = z.infer<typeof loginLogFilterSchema>;

/** Entities that appear in the action feed's filter; everything is logged, this only groups it. */
export const ACTION_LOG_ENTITIES = [
  "Payment",
  "Refund",
  "Discount",
  "Student",
  "GroupMembership",
  "Group",
  "Lesson",
  "Lead",
  "Exam",
  "SmsMessage",
] as const;

export const actionLogFilterSchema = z.object({
  entity: z.string().max(40).optional(),
  actorId: z.string().max(64).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type ActionLogFilters = z.infer<typeof actionLogFilterSchema>;

export const botRecipientSchema = z.object({
  userId: idSchema,
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{4,20}$/, "validation.chatId"),
  branchIds: z.array(idSchema).max(50).default([]),
});
export type BotRecipientInput = z.infer<typeof botRecipientSchema>;

export const INTEGRATION_PROVIDERS = [
  "SMS",
  "TELEGRAM",
  "AMOCRM",
  "TELEPHONY",
  "FACE_ID",
  "VIDEO",
  "PAYME",
  "CLICK",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

const secret = z.string().trim().max(500);
/** Secrets arrive masked from the form when unchanged; the service keeps the stored value then. */
export const MASKED = "••••••••";

export const smsIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  email: z.string().trim().max(200),
  password: secret,
  sender: z.string().trim().max(20).default("4546"),
});
export const telegramIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  botToken: secret,
  webhookSecret: secret,
  /** Without the @, e.g. "kampus_bot"; students open t.me/<username>?start=<code>. */
  botUsername: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_]{0,64}$/, "validation.botUsername")
    .transform((v) => v.replace(/^@/, ""))
    .default(""),
  /** Sunday evening digest to every chat linked to a student (A-118). */
  weeklyReport: z.boolean().default(true),
});
/** The four fields of the reference's AmoCRM page (EXP §8). */
export const amoCrmIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  secretKey: secret,
  integrationId: z.string().trim().max(200),
  authorizationCode: secret,
  subDomain: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9-]*$/i, "validation.subDomain"),
  /** Leads added in amoCRM come back through the webhook that presents this secret (A-115). */
  webhookSecret: secret.default(""),
  /** The board column they land in; empty = the first column of the first board. */
  leadColumnId: z.string().trim().max(50).default(""),
  /** The source they are filed under, created when missing. */
  leadSourceName: z.string().trim().max(100).default("Instagram"),
});
export const telephonyIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  webhookSecret: secret,
});
export const faceIdIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  webhookSecret: secret,
  /** Minutes of grace before a check-in counts as late (KECHIKISH). */
  lateAfterMinutes: z.coerce.number().int().min(0).max(240).default(0),
});

/** Public STUN servers that need no account; used until the centre sets its own. */
export const DEFAULT_STUN_URLS = "stun:stun.l.google.com:19302, stun:stun.cloudflare.com:3478";

/** Comma- or space-separated `stun:`/`turn:`/`turns:` URLs. */
const iceUrlList = (schemes: RegExp) =>
  z
    .string()
    .trim()
    .max(1000)
    .refine(
      (v) =>
        v
          .split(/[\s,]+/)
          .filter(Boolean)
          .every((u) => schemes.test(u)),
      "validation.iceUrl",
    );

/**
 * Video lessons (browser-to-browser WebRTC). STUN finds each browser's public
 * address; a TURN relay is optional and only needed behind strict networks.
 * `turnSecret` is coturn's `static-auth-secret`: when set, short-lived TURN
 * passwords are minted per call and the secret never reaches a browser.
 */
export const videoIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  stunUrls: iceUrlList(/^stuns?:\S+$/).default(DEFAULT_STUN_URLS),
  turnUrls: iceUrlList(/^turns?:\S+$/).default(""),
  turnUsername: z.string().trim().max(200).default(""),
  turnCredential: secret.default(""),
  turnSecret: secret.default(""),
  /** People in one call; every browser sends its video to every other one. */
  maxParticipants: z.coerce.number().int().min(2).max(30).default(12),
  /** Lesson recordings older than this are deleted with their file; 0 keeps them forever. */
  recordingKeepDays: z.coerce.number().int().min(0).max(3650).default(90),
});

/**
 * Payme Business merchant: students pay from their personal link, Payme calls
 * the Merchant API webhook with `Paycom:<key>` basic auth (A-106).
 */
export const paymeIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  merchantId: z.string().trim().max(64).default(""),
  key: secret.default(""),
  /** Test cashboxes use https://checkout.test.paycom.uz. */
  checkoutUrl: z
    .union([z.literal(""), z.string().trim().url("validation.url").max(200)])
    .default("")
    .transform((v) => v || "https://checkout.paycom.uz"),
});
/** Click merchant (SHOP API): prepare/complete webhooks signed with the secret key (A-106). */
export const clickIntegrationSchema = z.object({
  isEnabled: z.boolean(),
  serviceId: z.string().trim().max(32).default(""),
  merchantId: z.string().trim().max(32).default(""),
  merchantUserId: z.string().trim().max(32).default(""),
  secretKey: secret.default(""),
});

export const integrationSchemas = {
  SMS: smsIntegrationSchema,
  TELEGRAM: telegramIntegrationSchema,
  AMOCRM: amoCrmIntegrationSchema,
  TELEPHONY: telephonyIntegrationSchema,
  FACE_ID: faceIdIntegrationSchema,
  VIDEO: videoIntegrationSchema,
  PAYME: paymeIntegrationSchema,
  CLICK: clickIntegrationSchema,
} as const;
export type IntegrationInput<P extends IntegrationProvider> = z.infer<
  (typeof integrationSchemas)[P]
>;

export const STAFF_ATTENDANCE_TABS = [
  "daily",
  "weekly",
  "monthly",
  "statistics",
  "schedules",
] as const;
export type StaffAttendanceTab = (typeof STAFF_ATTENDANCE_TABS)[number];

export const staffAttendanceFilterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  branchId: optionalId,
  date: optionalDate,
});
export type StaffAttendanceFilters = z.infer<typeof staffAttendanceFilterSchema>;

export const workScheduleSchema = z
  .object({
    userId: idSchema,
    days: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          start: timeSchema,
          end: timeSchema,
        }),
      )
      .max(7),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<number>();
    value.days.forEach((d, i) => {
      if (seen.has(d.weekday)) {
        ctx.addIssue({ code: "custom", message: "validation.duplicate", path: ["days", i] });
      }
      seen.add(d.weekday);
      if (d.end <= d.start) {
        ctx.addIssue({
          code: "custom",
          message: "validation.endAfterStart",
          path: ["days", i, "end"],
        });
      }
    });
  });
export type WorkScheduleInput = z.infer<typeof workScheduleSchema>;

/** Manual check-in/out correction by a manager (A-87). */
export const manualCheckSchema = z.object({
  userId: idSchema,
  date: dateOnlySchema,
  checkIn: z.union([z.literal("").transform(() => null), z.null(), timeSchema]).optional(),
  checkOut: z.union([z.literal("").transform(() => null), z.null(), timeSchema]).optional(),
});
export type ManualCheckInput = z.infer<typeof manualCheckSchema>;
