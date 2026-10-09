import { z } from "zod";

import { idSchema } from "./common";
import { monthSchema, yearSchema } from "./finance";
import { dateOnlySchema } from "./settings";

/* Reports (EXP §10), Phase 12. Messages are i18n keys. */

const yesNo = z.enum(["yes", "no"]);

/** Branch / year / month, the filter row every report starts with. */
export const reportPeriodSchema = z.object({
  branchId: idSchema.optional(),
  year: yearSchema.optional(),
  month: monthSchema.optional(),
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const PAYMENTS_REPORT_TABS = ["teachers", "staff"] as const;
export type PaymentsReportTab = (typeof PAYMENTS_REPORT_TABS)[number];

/** "To'lovlar hisoboti" → the student payments list filters. */
export const studentPaymentsFilterSchema = reportPeriodSchema.extend({
  /** "To'lov sanasi bo'yicha": filter the period by payment date instead of the month paid for. */
  byPaidAt: z.coerce.boolean().optional(),
  groupId: idSchema.optional(),
  paymentMethodId: idSchema.optional(),
  teacherId: idSchema.optional(),
  courseId: idSchema.optional(),
  bonus: yesNo.optional(),
  receivedById: idSchema.optional(),
});
export type StudentPaymentsFilters = z.infer<typeof studentPaymentsFilterSchema>;
export const STUDENT_PAYMENT_SORT_FIELDS = ["paidAt", "amount", "effectiveMonth"] as const;
export type StudentPaymentSortField = (typeof STUDENT_PAYMENT_SORT_FIELDS)[number];

/** "Ketish va guruh o'zgarishi tahlili". */
export const CHURN_BREAKDOWNS = [
  "course",
  "teacher",
  "branch",
  "status",
  "reason",
  "joinedThisMonth",
] as const;
export type ChurnBreakdown = (typeof CHURN_BREAKDOWNS)[number];
export const churnFilterSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  branchId: idSchema.optional(),
  courseId: idSchema.optional(),
  teacherId: idSchema.optional(),
  groupId: idSchema.optional(),
  reason: z.string().trim().max(200).optional(),
  discount: yesNo.optional(),
});
export type ChurnFilters = z.infer<typeof churnFilterSchema>;

export const LEAVE_REASON_KINDS = ["LEAVE", "TRANSFER"] as const;
export type LeaveReasonKind = (typeof LEAVE_REASON_KINDS)[number];
export const leaveReasonSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(100, "validation.tooLong"),
  kind: z.enum(LEAVE_REASON_KINDS).default("LEAVE"),
  isActive: z.boolean().default(true),
});
export type LeaveReasonInput = z.infer<typeof leaveReasonSchema>;

/** "Bitiruvchilar hisoboti". */
export const graduatesFilterSchema = reportPeriodSchema.extend({
  groupId: idSchema.optional(),
  teacherId: idSchema.optional(),
  courseId: idSchema.optional(),
  result: yesNo.optional(),
});
export type GraduatesFilters = z.infer<typeof graduatesFilterSchema>;

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
export const graduateRecordSchema = z.object({
  ieltsScore: blankToNull(z.coerce.number().min(0, "validation.min").max(9, "validation.max")),
  cefrLevel: blankToNull(z.enum(CEFR_LEVELS)),
  university: z.boolean().nullable().optional(),
  employed: z.boolean().nullable().optional(),
  note: blankToNull(z.string().trim().max(500, "validation.tooLong")),
});
export type GraduateRecordInput = z.infer<typeof graduateRecordSchema>;

/** "Lidlar hisoboti". */
/** Reports → Referral programme (A-120): the period only. */
export const referralsReportFilterSchema = reportPeriodSchema;
export type ReferralsReportFilters = z.infer<typeof referralsReportFilterSchema>;

export const leadsReportFilterSchema = reportPeriodSchema.extend({
  sourceId: idSchema.optional(),
});
export type LeadsReportFilters = z.infer<typeof leadsReportFilterSchema>;

/** "O'quvchilar hisoboti": two tabs. */
export const STUDENTS_REPORT_TABS = ["attendance", "performance"] as const;
export type StudentsReportTab = (typeof STUDENTS_REPORT_TABS)[number];
export const studentsReportFilterSchema = reportPeriodSchema.extend({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  groupId: idSchema.optional(),
  teacherId: idSchema.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "TRIAL", "FROZEN", "ALL"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});
export type StudentsReportFilters = z.infer<typeof studentsReportFilterSchema>;

/** "Markaz Faoliyati Statistikasi". */
export const STATISTICS_VIEWS = ["monthly", "weekly", "daily"] as const;
export type StatisticsView = (typeof STATISTICS_VIEWS)[number];
export const statisticsFilterSchema = reportPeriodSchema.extend({
  view: z.enum(STATISTICS_VIEWS).optional(),
  /** Anchor day for the weekly and daily views (defaults to today). */
  date: dateOnlySchema.optional(),
});
export type StatisticsFilters = z.infer<typeof statisticsFilterSchema>;

/** Issuing a certificate to a graduate (round 2 G2, A-140). */
export const certificateSchema = z.object({
  title: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
  level: blankToNull(z.string().trim().max(40, "validation.tooLong")),
  issuedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
    .optional(),
});
export type CertificateInput = z.infer<typeof certificateSchema>;
