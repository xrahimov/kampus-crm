import { z } from "zod";

import { idSchema, passwordSchema, phoneSchema } from "./common";
import { MEMBERSHIP_STATUSES } from "./groups";
import { dateOnlySchema } from "./settings";

/* Students and payments (EXP §6, §5 "To'lov", §11 TO'LOV). Messages are i18n keys. */

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const text = (max: number) => z.string().trim().max(max, "validation.tooLong");
const money = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");
const positiveMoney = z.coerce
  .number()
  .positive("validation.min")
  .max(9_999_999_999_999, "validation.max");
/** Optional money from a form: "" and null both mean "not set". */
const optionalMoney = z.union([z.literal("").transform(() => null), z.null(), money]).optional();
const optionalId = z.union([z.literal("").transform(() => null), z.null(), idSchema]).optional();
const optionalPhone = z
  .union([z.literal("").transform(() => null), z.null(), phoneSchema])
  .optional();
const optionalDate = z
  .union([z.literal("").transform(() => null), z.null(), dateOnlySchema])
  .optional();

/** "YYYY-MM" or "YYYY-MM-DD" → the first day of that month. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/, "validation.date")
  .transform((v) => `${v.slice(0, 7)}-01`);

export const GENDERS = ["MALE", "FEMALE"] as const;

export const membershipDraftSchema = z.object({
  groupId: idSchema,
  joinedAt: dateOnlySchema,
  customPrice: optionalMoney,
  note: text(500).nullable().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).default("ACTIVE"),
});
export type MembershipDraftInput = z.infer<typeof membershipDraftSchema>;

export const parentSchema = z.object({ fullName: name, phone: phoneSchema });
export type ParentInput = z.infer<typeof parentSchema>;

const studentBase = z.object({
  branchId: idSchema,
  fullName: name,
  phone: optionalPhone,
  birthDate: optionalDate,
  gender: z.enum(GENDERS).default("MALE"),
  photoUrl: z.string().max(500).nullable().optional(),
  /** Student app login (A-06); stored hashed, never returned. */
  password: z.union([z.literal("").transform(() => null), z.null(), passwordSchema]).optional(),
  sourceId: optionalId,
  schoolId: optionalId,
  note: text(500).nullable().optional(),
});

/** "O'quvchi qo'shish": the profile plus the optional group and parent sections. */
export const studentCreateSchema = studentBase.extend({
  membership: membershipDraftSchema.nullable().optional(),
  parent: parentSchema.nullable().optional(),
});
export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

export const studentUpdateSchema = studentBase.omit({ branchId: true }).partial();
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;

export const STUDENT_SORT_FIELDS = ["fullName", "createdAt", "balance", "grade"] as const;
export type StudentSortField = (typeof STUDENT_SORT_FIELDS)[number];

/** "Guruhdagi holati" filter (EXP §6). */
export const GROUP_STATUS_FILTERS = [
  "ALL",
  "ACTIVE",
  "NEW",
  "FROZEN",
  "LEFT_AFTER_TRIAL",
  "NO_GROUP",
] as const;
export type GroupStatusFilter = (typeof GROUP_STATUS_FILTERS)[number];

/** "To'lov holati" filter (EXP §6, A-13). */
export const PAYMENT_STATUS_FILTERS = [
  "ALL",
  "DUE_SOON",
  "DEBTOR",
  "NOT_DEBTOR",
  "OVERPAID",
] as const;
export type PaymentStatusFilter = (typeof PAYMENT_STATUS_FILTERS)[number];

export const studentFilterSchema = z.object({
  archived: z.coerce.boolean().optional(),
  courseId: idSchema.optional(),
  schoolId: idSchema.optional(),
  groupId: idSchema.optional(),
  teacherId: idSchema.optional(),
  groupStatus: z.enum(GROUP_STATUS_FILTERS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS_FILTERS).optional(),
});
export type StudentFilters = z.infer<typeof studentFilterSchema>;

export const customFieldSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(60, "validation.tooLong"),
  value: text(500).nullable().optional(),
});
export type CustomFieldInput = z.infer<typeof customFieldSchema>;

export const studentCommentSchema = z.object({
  text: z.string().trim().min(1, "validation.required").max(2000, "validation.tooLong"),
  groupId: optionalId,
});
export type StudentCommentInput = z.infer<typeof studentCommentSchema>;

/** "Chegirma" (EXP §5 CHEGIRMALAR): a lower monthly price for N months. */
export const discountSchema = z.object({
  membershipId: idSchema,
  discountedPrice: money,
  months: z.coerce.number().int().min(1, "validation.min").max(36, "validation.max"),
  comment: text(500).nullable().optional(),
});
export type DiscountInput = z.infer<typeof discountSchema>;

/** The "To'lov" dialog. */
export const paymentSchema = z.object({
  membershipId: idSchema,
  paymentMethodId: idSchema,
  amount: positiveMoney,
  bonus: z.union([z.literal("").transform(() => 0), money]).default(0),
  effectiveMonth: monthSchema,
  paidAt: dateOnlySchema,
  comment: text(500).nullable().optional(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const refundSchema = z.object({
  amount: positiveMoney,
  reason: text(500).nullable().optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;

export const PAYMENT_SORT_FIELDS = ["paidAt", "createdAt", "amount"] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export const paymentFilterSchema = z.object({
  studentId: idSchema.optional(),
  groupId: idSchema.optional(),
  membershipId: idSchema.optional(),
  paymentMethodId: idSchema.optional(),
  receivedById: idSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type PaymentFilters = z.infer<typeof paymentFilterSchema>;

/** "Boshqa guruhga ko'chirish". */
export const transferSchema = z.object({
  groupId: idSchema,
  joinedAt: dateOnlySchema,
  customPrice: optionalMoney,
  note: text(500).nullable().optional(),
  reason: text(200).nullable().optional(),
});
export type TransferInput = z.infer<typeof transferSchema>;

export const leaveSchema = z.object({ reason: text(200).nullable().optional() });

/** "Chek sozlamalari" (EXP §8): the printable receipt's visible parts. */
export const RECEIPT_FIELDS = [
  "logo",
  "header",
  "address",
  "phone",
  "printedAt",
  "paymentId",
  "student",
  "group",
  "method",
  "paidAt",
  "cashier",
  "amount",
  "footer",
  "footerText",
  "qr",
  "teacher",
  "coursePrice",
] as const;
export type ReceiptField = (typeof RECEIPT_FIELDS)[number];

export const receiptSettingsSchema = z.object({
  address: text(200).nullable().optional(),
  phone: text(40).nullable().optional(),
  visibleFields: z.array(z.enum(RECEIPT_FIELDS)).max(RECEIPT_FIELDS.length),
  logoPosition: z.enum(["TOP", "BOTTOM"]),
  footerText: text(500).nullable().optional(),
});
export type ReceiptSettingsInput = z.infer<typeof receiptSettingsSchema>;
