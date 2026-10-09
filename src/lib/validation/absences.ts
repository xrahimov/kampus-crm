import { z } from "zod";

import { idSchema } from "./common";
import { DEBT_CHANNELS } from "./debts";

/* Absence follow-up (A-125). Messages are i18n keys. */

/** Why a student is on the list: absences in a row, or not seen for a number of days. */
export const ABSENCE_REASONS = ["STREAK", "SILENT"] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

/** How the student was reached; the same list as the debtor contacts. */
export const ABSENCE_CHANNELS = DEBT_CHANNELS;
export type AbsenceChannel = (typeof ABSENCE_CHANNELS)[number];

export const ABSENCE_OUTCOMES = ["NO_ANSWER", "WILL_RETURN", "ILL", "LEAVING", "OTHER"] as const;
export type AbsenceOutcome = (typeof ABSENCE_OUTCOMES)[number];

export const ABSENCE_CLOSE_REASONS = ["RETURNED", "LEFT", "CLEARED"] as const;
export type AbsenceCloseReason = (typeof ABSENCE_CLOSE_REASONS)[number];

/** The "Show" filter of the list; OPEN is the default. */
export const ABSENCE_LIST_FILTERS = ["OPEN", "NO_CONTACT", "CLOSED", "ALL"] as const;
export type AbsenceListFilter = (typeof ABSENCE_LIST_FILTERS)[number];

export const ABSENCE_SORT_FIELDS = [
  "sinceAt",
  "missed",
  "lastContactAt",
  "fullName",
  "group",
] as const;
export type AbsenceSortField = (typeof ABSENCE_SORT_FIELDS)[number];

const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();

export const absenceContactSchema = z.object({
  channel: z.enum(ABSENCE_CHANNELS),
  outcome: z.enum(ABSENCE_OUTCOMES).nullable().optional(),
  note: blankToNull(z.string().trim().max(1000, "validation.tooLong")),
});
export type AbsenceContactInput = z.infer<typeof absenceContactSchema>;

export const absenceFilterSchema = z.object({
  branchId: idSchema.optional(),
  status: z.enum(ABSENCE_LIST_FILTERS).optional(),
  reason: z.enum(ABSENCE_REASONS).optional(),
});
export type AbsenceFilters = z.infer<typeof absenceFilterSchema>;
