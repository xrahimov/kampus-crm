import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema } from "./settings";

/* Finance (EXP §9). Messages are i18n keys. */

export const FINANCE_KINDS = ["EXPENSE", "INCOME"] as const;
export type FinanceKind = (typeof FINANCE_KINDS)[number];

export const FINANCE_ENTRY_TYPES = [
  "EXPENSE",
  "INCOME",
  "ADVANCE",
  "MARKETING",
  "BONUS",
  "PENALTY",
  "INVESTMENT",
] as const;
export type FinanceEntryType = (typeof FINANCE_ENTRY_TYPES)[number];

/** Entry types that must name a staff member (advances, bonuses, fines). */
export const STAFF_ENTRY_TYPES: readonly FinanceEntryType[] = ["ADVANCE", "BONUS", "PENALTY"];
/** Entry types that live in a category ("/finance/costs/:categoryId"). */
export const CATEGORY_ENTRY_TYPES: readonly FinanceEntryType[] = ["EXPENSE", "INCOME"];

const money = z.coerce
  .number()
  .min(0.01, "validation.min")
  .max(9_999_999_999_999, "validation.max");
const text = (max: number) => z.string().trim().max(max, "validation.tooLong");
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const optionalId = blankToNull(idSchema);
export const yearSchema = z.coerce.number().int().min(2000).max(2100);
export const monthSchema = z.coerce.number().int().min(1).max(12);

export const financeCategorySchema = z.object({
  kind: z.enum(FINANCE_KINDS),
  name: z.string().trim().min(1, "validation.required").max(80, "validation.tooLong"),
});
export type FinanceCategoryInput = z.infer<typeof financeCategorySchema>;

export const financeEntrySchema = z
  .object({
    type: z.enum(FINANCE_ENTRY_TYPES),
    branchId: idSchema,
    categoryId: optionalId,
    paymentMethodId: optionalId,
    amount: money,
    date: dateOnlySchema,
    comment: blankToNull(text(500)),
    staffId: optionalId,
    studentId: optionalId,
    counterparty: blankToNull(text(120)),
  })
  .superRefine((v, ctx) => {
    if (STAFF_ENTRY_TYPES.includes(v.type) && !v.staffId) {
      ctx.addIssue({ code: "custom", path: ["staffId"], message: "validation.required" });
    }
    if (CATEGORY_ENTRY_TYPES.includes(v.type) && !v.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "validation.required" });
    }
    if (v.type === "INVESTMENT" && !v.counterparty) {
      ctx.addIssue({ code: "custom", path: ["counterparty"], message: "validation.required" });
    }
  });
export type FinanceEntryInput = z.infer<typeof financeEntrySchema>;

export const financeEntryFilterSchema = z.object({
  type: z.enum(FINANCE_ENTRY_TYPES),
  categoryId: idSchema.optional(),
  branchId: idSchema.optional(),
  year: yearSchema.optional(),
  month: monthSchema.optional(),
  paymentMethodId: idSchema.optional(),
  staffId: idSchema.optional(),
});
export type FinanceEntryFilters = z.infer<typeof financeEntryFilterSchema>;

export const financePeriodSchema = z.object({
  branchId: idSchema.optional(),
  year: yearSchema,
  month: monthSchema.optional(),
  paymentMethodId: idSchema.optional(),
});
export type FinancePeriod = z.infer<typeof financePeriodSchema>;

export const financePlanSchema = z.object({
  branchId: idSchema.optional(),
  year: yearSchema,
  month: monthSchema,
  /** "Tasir vaqti": count payments by the month they apply to instead of the payment date. */
  effective: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
    .transform((v) => v === true || v === "1" || v === "true")
    .default(true),
});
export type FinancePlanFilters = z.infer<typeof financePlanSchema>;

export const PAYROLL_STATUSES = ["DRAFT", "SAVED"] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];
export const payrollSaveSchema = z.object({ status: z.enum(PAYROLL_STATUSES) });
/** "/finance/salary-detail/:YYYY-MM-01" → the first day of the month. */
export const payrollMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-01)?$/, "validation.date")
  .transform((v) => v.slice(0, 7));
