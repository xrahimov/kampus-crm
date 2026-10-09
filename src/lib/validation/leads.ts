import { z } from "zod";

import { idSchema, phoneSchema } from "./common";
import { DEBT_CHANNELS } from "./debts";
import { MEMBERSHIP_STATUSES } from "./groups";
import { dateOnlySchema, timeSchema } from "./settings";

/* Leads (EXP §2, §3, §8 Forms). Messages are i18n keys. */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "UNREACHABLE", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];
export const LEAD_DAYS = ["ODD", "EVEN", "OTHER"] as const;
export type LeadDays = (typeof LEAD_DAYS)[number];

/* Follow-up on a lead (A-126): how a contact happened, how it ended, what the call list shows. */
export const LEAD_CONTACT_CHANNELS = DEBT_CHANNELS;
export type LeadContactChannel = (typeof LEAD_CONTACT_CHANNELS)[number];
export const LEAD_CONTACT_OUTCOMES = [
  "NO_ANSWER",
  "WILL_COME",
  "THINKING",
  "NOT_INTERESTED",
  "WRONG_NUMBER",
  "OTHER",
] as const;
export type LeadContactOutcome = (typeof LEAD_CONTACT_OUTCOMES)[number];
/** "Calls today": which next-contact dates to list, relative to today. */
export const LEAD_CALL_RANGES = ["DUE", "OVERDUE", "TODAY", "UPCOMING", "NONE"] as const;
export type LeadCallRange = (typeof LEAD_CALL_RANGES)[number];
export const LEAD_CALL_SORT_FIELDS = [
  "nextContactAt",
  "fullName",
  "lastContactAt",
  "createdAt",
] as const;
export type LeadCallSortField = (typeof LEAD_CALL_SORT_FIELDS)[number];

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const text = (max: number) => z.string().trim().max(max, "validation.tooLong");
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const optionalId = blankToNull(idSchema);
const optionalDate = blankToNull(dateOnlySchema);
const optionalTime = blankToNull(timeSchema);
const optionalAge = blankToNull(
  z.coerce.number().int().min(1, "validation.min").max(120, "validation.max"),
);

export const leadBoardSchema = z.object({ name });
export type LeadBoardInput = z.infer<typeof leadBoardSchema>;

export const leadColumnSchema = z.object({ name: name.max(60, "validation.tooLong") });
export type LeadColumnInput = z.infer<typeof leadColumnSchema>;

/** The "Yangi Lid" dialog: every field optional except the name and the column. */
export const leadSchema = z.object({
  columnId: idSchema,
  fullName: name,
  /** Several numbers ("+ Telefon raqam qo'shish"); blanks are dropped. */
  phones: z
    .array(z.union([z.literal(""), z.literal("+998"), phoneSchema]))
    .max(5, "validation.max")
    .default([])
    .transform((list) => list.filter((p) => p !== "" && p !== "+998")),
  birthDate: optionalDate,
  age: optionalAge,
  sourceId: optionalId,
  teacherId: optionalId,
  /** The student whose invite brought the lead (A-120). */
  referrerId: optionalId,
  /** Who works the lead and when to contact them next (A-126). */
  ownerId: optionalId,
  nextContactAt: optionalDate,
  days: blankToNull(z.enum(LEAD_DAYS)),
  lessonTime: optionalTime,
  status: z.enum(LEAD_STATUSES).default("NEW"),
  temperature: blankToNull(z.enum(LEAD_TEMPERATURES)),
  comment: text(2000).nullable().optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const leadUpdateSchema = leadSchema.partial();
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

/** Drop on another column, optionally before a given lead. */
export const leadMoveSchema = z.object({
  columnId: idSchema,
  beforeLeadId: idSchema.nullable().optional(),
});
export type LeadMoveInput = z.infer<typeof leadMoveSchema>;

export const leadFilterSchema = z.object({
  boardId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
  lessonTime: timeSchema.optional(),
  teacherId: idSchema.optional(),
  days: z.enum(LEAD_DAYS).optional(),
  /** A staff member's id, or "none" for leads nobody owns (A-126). */
  ownerId: z.union([z.literal("none"), idSchema]).optional(),
  archived: z.coerce.boolean().optional(),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

/** "Log a contact" on a lead (A-126): how, the outcome, a note, the next date and, if changed by hand, the status. */
export const leadContactSchema = z.object({
  channel: z.enum(LEAD_CONTACT_CHANNELS),
  outcome: blankToNull(z.enum(LEAD_CONTACT_OUTCOMES)),
  note: blankToNull(text(1000)),
  nextContactAt: optionalDate,
  status: blankToNull(z.enum(LEAD_STATUSES)),
});
export type LeadContactInput = z.infer<typeof leadContactSchema>;

/** The "Calls today" list: whose leads ("me", "none" or a staff id) and which dates. */
export const leadCallsFilterSchema = z.object({
  ownerId: z.union([z.literal("me"), z.literal("none"), idSchema]).optional(),
  range: z.enum(LEAD_CALL_RANGES).optional(),
});
export type LeadCallsFilters = z.infer<typeof leadCallsFilterSchema>;

/** A lead's trial lesson (A-131): booked from the card, marked on the Today roster. */
export const TRIAL_STATUSES = ["BOOKED", "ATTENDED", "NO_SHOW", "CONVERTED", "CANCELLED"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];
/** The outcomes staff set by hand; CONVERTED comes from adding the lead to the group. */
export const TRIAL_OUTCOMES = ["BOOKED", "ATTENDED", "NO_SHOW", "CANCELLED"] as const;
export type TrialOutcome = (typeof TRIAL_OUTCOMES)[number];

/** "Book a trial": the group, the day and a note for the teacher. */
export const trialBookingSchema = z.object({
  groupId: idSchema,
  date: dateOnlySchema,
  note: blankToNull(text(500)),
});
export type TrialBookingInput = z.infer<typeof trialBookingSchema>;

export const trialOutcomeSchema = z.object({ status: z.enum(TRIAL_OUTCOMES) });
export type TrialOutcomeInput = z.infer<typeof trialOutcomeSchema>;

/** Bulk actions on the board (A-132): the ticked leads move, archive or come back together. */
const bulkLeadIds = z.array(idSchema).min(1, "validation.leadsMin").max(500, "validation.max");
export const bulkLeadsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("archive"), leadIds: bulkLeadIds }),
  z.object({ action: z.literal("restore"), leadIds: bulkLeadIds }),
  z.object({ action: z.literal("move"), leadIds: bulkLeadIds, columnId: idSchema }),
]);
export type BulkLeadsInput = z.infer<typeof bulkLeadsSchema>;

/** "LIDLARNI GURUHGA QO'SHISH": the selected leads become students of one group. */
export const leadsToGroupSchema = z.object({
  leadIds: z.array(idSchema).min(1, "validation.leadsMin").max(100, "validation.max"),
  groupId: idSchema,
  joinedAt: dateOnlySchema,
  status: z.enum(MEMBERSHIP_STATUSES).default("NEW"),
});
export type LeadsToGroupInput = z.infer<typeof leadsToGroupSchema>;

/** "Lidlarga qaytarish" on a group member. */
export const toLeadSchema = z.object({
  boardId: optionalId,
  columnId: optionalId,
  reason: text(500).nullable().optional(),
});
export type ToLeadInput = z.infer<typeof toLeadSchema>;

export const leadSourceSchema = z.object({
  name: name.max(60, "validation.tooLong"),
  isActive: z.boolean().default(true),
});
export type LeadSourceInput = z.infer<typeof leadSourceSchema>;

export const sourceStatsSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type SourceStatsFilters = z.infer<typeof sourceStatsSchema>;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "validation.required")
  .max(60, "validation.tooLong")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "validation.slug");

/** Settings → "Formalar". */
export const leadFormSchema = z.object({
  name,
  slug,
  columnId: idSchema,
  sourceId: optionalId,
  integration: text(120).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type LeadFormInput = z.infer<typeof leadFormSchema>;

/** What a visitor sends from the public form page. */
export const publicLeadSchema = z.object({
  fullName: name,
  phone: phoneSchema,
  comment: text(1000).nullable().optional(),
  /** An invite code from a student's link (`?ref=`), A-120; unknown codes are ignored. */
  ref: z.string().trim().max(32).nullable().optional(),
});
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

/* Waiting list (A-138): who waits for which course, and offers when a group opens. */
export const WAITLIST_STATUSES = ["WAITING", "OFFERED", "ENROLLED", "DECLINED", "REMOVED"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];
export const WAITLIST_SORT_FIELDS = ["createdAt", "fullName", "status"] as const;
export type WaitlistSortField = (typeof WAITLIST_SORT_FIELDS)[number];

export const waitlistEntrySchema = z.object({
  branchId: idSchema,
  courseId: idSchema,
  /** The lead the entry comes from; name and phone are copied from it when given. */
  leadId: idSchema.nullable().optional(),
  studentId: idSchema.nullable().optional(),
  fullName: name,
  phone: phoneSchema,
  days: z.enum(LEAD_DAYS).nullable().optional(),
  lessonTime: timeSchema.nullable().optional(),
  note: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
});
export type WaitlistEntryInput = z.infer<typeof waitlistEntrySchema>;

export const waitlistUpdateSchema = waitlistEntrySchema
  .omit({ branchId: true, leadId: true, studentId: true })
  .partial()
  .extend({
    /** Back to waiting, declined by the person, or taken off the list. */
    status: z.enum(["WAITING", "DECLINED", "REMOVED"]).optional(),
  });
export type WaitlistUpdateInput = z.infer<typeof waitlistUpdateSchema>;

export const waitlistFilterSchema = z.object({
  courseId: idSchema.optional(),
  status: z.enum(WAITLIST_STATUSES).optional(),
});
export type WaitlistFilters = z.infer<typeof waitlistFilterSchema>;

/** "Offer seats": the group's free seats go to the first entries in line. */
export const waitlistOfferSchema = z.object({
  /** How many to offer; defaults to the group's free seats, or every waiting entry when the rooms have no capacity. */
  limit: z.coerce.number().int().min(1, "validation.min").max(100, "validation.max").optional(),
});
export type WaitlistOfferInput = z.infer<typeof waitlistOfferSchema>;

export const waitlistEnrolSchema = z.object({
  groupId: idSchema,
  joinedAt: dateOnlySchema,
  status: z.enum(MEMBERSHIP_STATUSES).default("NEW"),
});
export type WaitlistEnrolInput = z.infer<typeof waitlistEnrolSchema>;

/* ----- the lead inbox (A-146) ------------------------------------------------------------ */

export const INBOX_STATUSES = ["open", "closed", "all"] as const;
export const inboxFilterSchema = z.object({
  status: z.enum(INBOX_STATUSES).default("open"),
  q: z.string().trim().max(120).optional(),
});
export type InboxFilters = z.output<typeof inboxFilterSchema>;

export const inboxReplySchema = z.object({
  text: z.string().trim().min(1, "validation.required").max(4000, "validation.max"),
});
export type InboxReplyInput = z.output<typeof inboxReplySchema>;

export const inboxCloseSchema = z.object({ closed: z.boolean() });
export type InboxCloseInput = z.output<typeof inboxCloseSchema>;
