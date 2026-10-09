import { z } from "zod";

import { idSchema } from "./common";
import { financePeriodSchema } from "./finance";

/** EXP §1 schedule grid: weekday tabs and the "Vaqt oralig'i" step. */
export const SCHEDULE_STEPS = [30, 60] as const;
export type ScheduleStep = (typeof SCHEDULE_STEPS)[number];

export const dashboardKpiSchema = z.object({ branchId: idSchema.optional() });
export type DashboardKpiFilters = z.infer<typeof dashboardKpiSchema>;

export const scheduleSchema = z.object({
  branchId: idSchema.optional(),
  /** 1 = Monday … 7 = Sunday; defaults to today. */
  weekday: z.coerce.number().int().min(1).max(7).optional(),
  step: z.coerce
    .number()
    .refine((v): v is ScheduleStep => (SCHEDULE_STEPS as readonly number[]).includes(v), {
      message: "validation.invalid",
    })
    .default(30),
});
export type ScheduleFilters = z.infer<typeof scheduleSchema>;

export const dashboardFinanceSchema = financePeriodSchema;

export const searchSchema = z.object({ q: z.string().trim().min(2).max(80) });

export const notificationsQuerySchema = z.object({
  unread: z
    .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
    .transform((v) => v === true || v === "1" || v === "true")
    .default(false),
  page: z.coerce.number().int().min(1).default(1),
});
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

export const markReadSchema = z
  .object({
    ids: z.array(idSchema).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all || (v.ids && v.ids.length > 0), { message: "validation.required" });
export type MarkReadInput = z.infer<typeof markReadSchema>;

/** The setup checklist on the home page (A-128): show it again or hide it. */
export const setupChecklistSchema = z.object({ shown: z.boolean() });
export type SetupChecklistInput = z.infer<typeof setupChecklistSchema>;
