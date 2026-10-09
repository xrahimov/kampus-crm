import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema } from "./settings";

/* Debt collection (A-112). Messages are i18n keys. */

export const DEBT_STATUSES = ["OPEN", "PROMISED", "CLOSED"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const DEBT_CLOSE_REASONS = ["PAID", "PROMISE_KEPT", "LEFT"] as const;
export type DebtCloseReason = (typeof DEBT_CLOSE_REASONS)[number];

export const DEBT_CHANNELS = ["CALL", "TELEGRAM", "SMS", "VISIT", "NOTE"] as const;
export type DebtChannel = (typeof DEBT_CHANNELS)[number];

/** Every outcome a contact row can carry; the last two are written by the system. */
export const DEBT_OUTCOMES = [
  "NO_ANSWER",
  "PROMISED",
  "REFUSED",
  "WRONG_NUMBER",
  "OTHER",
  "PROMISE_KEPT",
  "PROMISE_BROKEN",
] as const;
export type DebtOutcome = (typeof DEBT_OUTCOMES)[number];

/** What staff may pick when they log a contact. */
export const DEBT_STAFF_OUTCOMES = [
  "NO_ANSWER",
  "PROMISED",
  "REFUSED",
  "WRONG_NUMBER",
  "OTHER",
] as const;
export type DebtStaffOutcome = (typeof DEBT_STAFF_OUTCOMES)[number];

/** The "Show" filter of the debtor list; ACTIVE (open or promised) is the default. */
export const DEBT_LIST_FILTERS = [
  "ACTIVE",
  "OPEN",
  "PROMISED",
  "NEEDS_CALL",
  "CLOSED",
  "ALL",
] as const;
export type DebtListFilter = (typeof DEBT_LIST_FILTERS)[number];

export const DEBT_SORT_FIELDS = [
  "openedAt",
  "amount",
  "promisedAt",
  "lastContactAt",
  "fullName",
] as const;
export type DebtSortField = (typeof DEBT_SORT_FIELDS)[number];

const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const optionalDate = blankToNull(dateOnlySchema);
const optionalMoney = blankToNull(
  z.coerce.number().min(1, "validation.min").max(9_999_999_999_999, "validation.max"),
);

export const debtContactSchema = z
  .object({
    channel: z.enum(DEBT_CHANNELS),
    outcome: z.enum(DEBT_STAFF_OUTCOMES).nullable().optional(),
    promisedAt: optionalDate,
    promisedAmount: optionalMoney,
    note: blankToNull(z.string().trim().max(1000, "validation.tooLong")),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "PROMISED" && !v.promisedAt) {
      ctx.addIssue({ code: "custom", path: ["promisedAt"], message: "validation.required" });
    }
  });
export type DebtContactInput = z.infer<typeof debtContactSchema>;

export const debtFilterSchema = z.object({
  branchId: idSchema.optional(),
  status: z.enum(DEBT_LIST_FILTERS).optional(),
});
export type DebtFilters = z.infer<typeof debtFilterSchema>;
