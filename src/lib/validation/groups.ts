import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema, timeSchema } from "./settings";

/* Groups (EXP §5). Messages are i18n keys. */

export const GROUP_STATUSES = ["ACTIVE", "ARCHIVED", "TRIAL", "FROZEN"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];
export const WEEKDAY_PATTERNS = ["EVEN", "ODD", "EVERY_DAY", "CUSTOM"] as const;
export type WeekdayPattern = (typeof WEEKDAY_PATTERNS)[number];
export const GROUP_TEACHER_ROLES = ["MAIN", "ASSISTANT", "CO_TEACHER"] as const;
export const SHARE_TYPES = ["PERCENT", "PER_LESSON", "PER_STUDENT"] as const;
export const MEMBERSHIP_STATUSES = [
  "NEW",
  "TRIAL",
  "ACTIVE",
  "FROZEN",
  "ARCHIVED",
  "GRADUATED",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "EXCUSED", "NOT_MARKED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** ISO weekdays, 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const money = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");

export const scheduleSlotSchema = z
  .object({
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: timeSchema,
    endTime: timeSchema,
    roomId: idSchema.nullable().optional(),
  })
  .refine((s) => s.endTime > s.startTime, { message: "validation.workHours", path: ["endTime"] });
export type ScheduleSlotInput = z.infer<typeof scheduleSlotSchema>;

export const groupTeacherSchema = z.object({
  userId: idSchema,
  role: z.enum(GROUP_TEACHER_ROLES).default("MAIN"),
  shareType: z.enum(SHARE_TYPES).default("PERCENT"),
  shareValue: money,
});
export type GroupTeacherInput = z.infer<typeof groupTeacherSchema>;

/** How a group charges (A-178): the course's monthly fee, or packages of N lessons. */
export const BILLING_MODES = ["MONTHLY", "PACKAGES"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

const groupBase = z.object({
  branchId: idSchema,
  name,
  courseId: idSchema,
  gradingSystemId: idSchema.nullable().optional(),
  /** Defaults to the monthly fee; packages (A-178) are chosen per group. */
  billingMode: z.enum(BILLING_MODES).optional(),
  weekdayPattern: z.enum(WEEKDAY_PATTERNS).default("EVEN"),
  /** One per weekday; CUSTOM uses exactly these days, the other patterns fix the days. */
  slots: z.array(scheduleSlotSchema).min(1, "validation.slotsMin").max(7),
  teachers: z.array(groupTeacherSchema).max(3, "validation.teachersMax").default([]),
  startDate: dateOnlySchema,
  /** Defaults to start date + course duration (A-51). */
  endDate: dateOnlySchema.nullable().optional(),
  status: z.enum(GROUP_STATUSES).default("ACTIVE"),
  /** The clash warning (A-116) was shown and the user chose to save anyway. */
  ignoreClashes: z.boolean().optional(),
});

export const groupSchema = groupBase
  .refine((g) => new Set(g.slots.map((s) => s.weekday)).size === g.slots.length, {
    message: "validation.slotsUnique",
    path: ["slots"],
  })
  .refine((g) => new Set(g.teachers.map((t) => t.userId)).size === g.teachers.length, {
    message: "validation.teachersUnique",
    path: ["teachers"],
  })
  .refine((g) => !g.endDate || g.endDate >= g.startDate, {
    message: "validation.endAfterStart",
    path: ["endDate"],
  });
export type GroupInput = z.infer<typeof groupSchema>;

/**
 * How a change of days or times lands on a group that is already running (A-193):
 * lessons before `scheduleFrom` stay as they were (today in Tashkent when left out,
 * never a later day), and the students may be told about the new times.
 */
const scheduleChange = {
  scheduleFrom: dateOnlySchema.optional(),
  notifySchedule: z.boolean().optional(),
};

export const groupUpdateSchema = groupBase
  .omit({ branchId: true })
  .partial()
  .extend(scheduleChange);
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;

/** Only the days, times and rooms of a group: what its own teacher may change (A-193). */
export const groupScheduleSchema = groupBase
  .pick({ weekdayPattern: true, slots: true, ignoreClashes: true })
  .extend(scheduleChange)
  .refine((g) => new Set(g.slots.map((s) => s.weekday)).size === g.slots.length, {
    message: "validation.slotsUnique",
    path: ["slots"],
  });
export type GroupScheduleInput = z.infer<typeof groupScheduleSchema>;

export const GROUP_SORT_FIELDS = ["name", "startDate", "endDate", "createdAt"] as const;
export type GroupSortField = (typeof GROUP_SORT_FIELDS)[number];

export const groupFilterSchema = z.object({
  /** Default "active"; "all" lifts the filter (EXP §5 status select). */
  status: z.enum([...GROUP_STATUSES, "ALL"]).optional(),
  teacherId: idSchema.optional(),
  courseId: idSchema.optional(),
  weekdayPattern: z.enum(WEEKDAY_PATTERNS).optional(),
});

export const moveBranchSchema = z.object({ branchId: idSchema });
export const changeTeacherSchema = z.object({
  fromUserId: idSchema,
  to: groupTeacherSchema,
});
export const supportTeachersSchema = z.object({ userIds: z.array(idSchema).max(10) });
/** Where a cancelled lesson moves to (A-117). */
export const lessonMoveSchema = z
  .object({ date: dateOnlySchema, startTime: timeSchema, endTime: timeSchema })
  .refine((s) => s.endTime > s.startTime, { message: "validation.workHours", path: ["endTime"] });
export type LessonMoveInput = z.output<typeof lessonMoveSchema>;
/** A teacher's hours open for 1:1 booking (A-169): up to three windows per weekday. */
export const AVAILABILITY_MAX = 21;
export const availabilitySchema = z.object({
  windows: z
    .array(
      z
        .object({
          weekday: z.coerce.number().int().min(1).max(7),
          startTime: timeSchema,
          endTime: timeSchema,
        })
        .refine((w) => w.endTime > w.startTime, {
          message: "validation.workHours",
          path: ["endTime"],
        }),
    )
    .max(AVAILABILITY_MAX),
});
export type AvailabilityInput = z.output<typeof availabilitySchema>;
export const groupDayOffSchema = z.object({
  date: dateOnlySchema,
  reason: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
  /** Tell the current students and their parents by Telegram and auto-SMS (A-117). */
  notify: z.boolean().default(true),
  /** The lesson moves to this date and time instead of being dropped (A-117). */
  moveTo: lessonMoveSchema.nullable().optional(),
});
export type GroupDayOffInput = z.output<typeof groupDayOffSchema>;
export const extraLessonSchema = z
  .object({ date: dateOnlySchema, startTime: timeSchema, endTime: timeSchema })
  .refine((s) => s.endTime > s.startTime, { message: "validation.workHours", path: ["endTime"] });
export const lessonUpdateSchema = z.object({
  topic: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
  /** A topic of the group's course syllabus (A-137); null clears it. */
  courseTopicId: z.string().max(50).nullable().optional(),
  attachmentUrl: z.string().max(500).nullable().optional(),
  /** The teacher's note to the students about the lesson (A-168); null clears it. */
  studentNote: z.string().trim().max(1000, "validation.tooLong").nullable().optional(),
});
/** A student rates a lesson from their page (A-168). */
export const lessonRatingSchema = z.object({
  rating: z.coerce.number().int().min(1, "validation.min").max(5, "validation.max"),
  comment: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
});
export type LessonRatingInput = z.output<typeof lessonRatingSchema>;
export const attendanceSchema = z.object({
  marks: z
    .array(
      z.object({
        membershipId: idSchema,
        status: z.enum(ATTENDANCE_STATUSES),
        comment: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export const gradesSchema = z.object({
  grades: z
    .array(
      z.object({
        membershipId: idSchema,
        /** null clears the grade. */
        score: z.coerce.number().min(0, "validation.min").max(1000, "validation.max").nullable(),
        comment: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});
export const groupNoteSchema = z.object({
  text: z.string().trim().min(1, "validation.required").max(2000, "validation.tooLong"),
});

// --- Members (EXP §5 "Guruhga o'quvchi qo'shish", manual mode) --------------

/** "Charged from" (A-110): "" and null both mean "from the activation or join date". */
const optionalDate = z
  .union([z.literal("").transform(() => null), z.null(), dateOnlySchema])
  .optional();

export const addMemberSchema = z
  .object({
    /** An existing student, or a new minimal one (Phase 6 brings the full profile). */
    studentId: idSchema.optional(),
    newStudent: z
      .object({
        fullName: name,
        phone: z.string().trim().max(20).nullable().optional(),
      })
      .optional(),
    joinedAt: dateOnlySchema,
    billingFrom: optionalDate,
    customPrice: z.union([z.literal("").transform(() => null), z.null(), money]).optional(),
    note: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
    status: z.enum(MEMBERSHIP_STATUSES).default("ACTIVE"),
  })
  .refine((m) => !!m.studentId !== !!m.newStudent, {
    message: "validation.studentRequired",
    path: ["studentId"],
  });
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const membershipUpdateSchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  billingFrom: optionalDate,
  customPrice: z.union([z.literal("").transform(() => null), z.null(), money]).optional(),
  note: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
});
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;

/** Homework for one lesson (A-102). */
export const homeworkSchema = z.object({
  text: z.string().trim().min(1, "validation.required").max(4000, "validation.tooLong"),
  linkUrl: z
    .union([z.literal(""), z.string().trim().url("validation.url").max(500)])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  attachmentUrl: z.string().max(500).nullable().optional(),
  /** A speaking task: the student records their answer (A-141). */
  speaking: z.boolean().optional(),
  dueDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type HomeworkInput = z.output<typeof homeworkSchema>;

/** One line of an assignment's rubric (A-161). */
export const rubricCriterionSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(120, "validation.tooLong"),
  max: z.number().int().min(1).max(100),
});
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

/** A standalone assignment for the whole group: a project or essay with a name, a due date and a rubric (A-161). */
export const assignmentSchema = homeworkSchema.extend({
  title: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
  rubric: z.array(rubricCriterionSchema).max(10).optional().default([]),
});
export type AssignmentInput = z.output<typeof assignmentSchema>;

export const HOMEWORK_REVIEW_STATUSES = ["ACCEPTED", "RETURNED"] as const;
export const homeworkReviewSchema = z.object({
  status: z.enum(HOMEWORK_REVIEW_STATUSES),
  teacherComment: z.string().trim().max(1000, "validation.tooLong").nullable().optional(),
  /** A recorded reply, uploaded first; omitted keeps the earlier one, null clears it. */
  teacherAudioUrl: z.string().max(500).nullable().optional(),
  /** Points per rubric criterion, in rubric order (A-161); only on an assignment with a rubric. */
  rubricScores: z.array(z.number().int().min(0)).max(10).optional(),
});
export type HomeworkReviewInput = z.output<typeof homeworkReviewSchema>;

export const homeworkSubmissionSchema = z.object({
  note: z.string().trim().max(4000, "validation.tooLong").nullable().optional(),
  attachmentUrl: z.string().max(500).nullable().optional(),
});
export type HomeworkSubmissionInput = z.output<typeof homeworkSubmissionSchema>;

/* ----- lesson materials (A-105) ------------------------------------------------------------ */

export const MATERIAL_INPUT_KINDS = ["FILE", "LINK"] as const;
export const materialSchema = z
  .object({
    lessonId: z
      .union([z.literal(""), idSchema])
      .nullable()
      .optional()
      .transform((v) => v || null),
    kind: z.enum(MATERIAL_INPUT_KINDS),
    title: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
    /** A stored file URL for FILE, any https link for LINK. */
    url: z.string().trim().min(1, "validation.required").max(500, "validation.tooLong"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "LINK" && !/^https?:\/\//i.test(v.url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "validation.url" });
    }
    if (v.kind === "FILE" && !v.url.startsWith("/api/v1/files/")) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "validation.fileRequired" });
    }
  });
export type MaterialInput = z.output<typeof materialSchema>;

/** Attendance by QR (A-139): the badge's code, and the lesson it is for when scanned from a lesson. */
export const attendanceScanSchema = z.object({
  code: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
  lessonId: idSchema.optional(),
});
export type AttendanceScanInput = z.infer<typeof attendanceScanSchema>;

/** One message in a group's chat (A-170). */
export const chatMessageSchema = z.object({
  text: z.string().trim().min(1, "validation.required").max(2000, "validation.tooLong"),
});
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
/** Where the student's player is in a recording (A-175). */
export const materialProgressSchema = z.object({
  positionSec: z.coerce
    .number()
    .min(0)
    .max(24 * 60 * 60),
  durationSec: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60)
    .nullable()
    .default(null),
});
export type MaterialProgressInput = z.infer<typeof materialProgressSchema>;
