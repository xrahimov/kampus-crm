import { z } from "zod";

import { idSchema } from "./common";

/* Announcements (A-129): one notice to a group, a branch or the whole centre. */

export const ANNOUNCEMENT_AUDIENCES = ["CENTRE", "BRANCH", "GROUP"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export const ANNOUNCEMENT_SORT_FIELDS = ["createdAt", "title"] as const;
export type AnnouncementSortField = (typeof ANNOUNCEMENT_SORT_FIELDS)[number];

const optionalId = z.union([z.literal("").transform(() => null), z.null(), idSchema]).optional();

export const announcementSchema = z
  .object({
    audience: z.enum(ANNOUNCEMENT_AUDIENCES),
    branchId: optionalId,
    groupId: optionalId,
    title: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
    body: z.string().trim().min(1, "validation.required").max(2000, "validation.tooLong"),
    /** Students with a phone number also get the text as an SMS. */
    sendSms: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "BRANCH" && !v.branchId) {
      ctx.addIssue({ code: "custom", path: ["branchId"], message: "validation.required" });
    }
    if (v.audience === "GROUP" && !v.groupId) {
      ctx.addIssue({ code: "custom", path: ["groupId"], message: "validation.required" });
    }
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const announcementFilterSchema = z.object({
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).optional(),
  branchId: idSchema.optional(),
  groupId: idSchema.optional(),
});
export type AnnouncementFilters = z.infer<typeof announcementFilterSchema>;

/** The student's page reports which announcements were opened. */
export const announcementReadSchema = z.object({
  ids: z.array(idSchema).min(1, "validation.required").max(50, "validation.max"),
});
export type AnnouncementReadInput = z.infer<typeof announcementReadSchema>;
