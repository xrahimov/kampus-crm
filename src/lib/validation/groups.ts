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

const groupBase = z.object({
  branchId: idSchema,
  name,
  courseId: idSchema,
  gradingSystemId: idSchema.nullable().optional(),
  weekdayPattern: z.enum(WEEKDAY_PATTERNS).default("EVEN"),
  /** One per weekday; CUSTOM uses exactly these days, the other patterns fix the days. */
  slots: z.array(scheduleSlotSchema).min(1, "validation.slotsMin").max(7),
  teachers: z.array(groupTeacherSchema).max(3, "validation.teachersMax").default([]),
  startDate: dateOnlySchema,
  /** Defaults to start date + course duration (A-51). */
  endDate: dateOnlySchema.nullable().optional(),
  status: z.enum(GROUP_STATUSES).default("ACTIVE"),
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

export const groupUpdateSchema = groupBase.omit({ branchId: true }).partial();
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;

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
export const groupDayOffSchema = z.object({
  date: dateOnlySchema,
  reason: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
});
export const extraLessonSchema = z
  .object({ date: dateOnlySchema, startTime: timeSchema, endTime: timeSchema })
  .refine((s) => s.endTime > s.startTime, { message: "validation.workHours", path: ["endTime"] });
export const lessonUpdateSchema = z.object({
  topic: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
  attachmentUrl: z.string().max(500).nullable().optional(),
});
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
  dueDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});
export type HomeworkInput = z.output<typeof homeworkSchema>;

export const HOMEWORK_REVIEW_STATUSES = ["ACCEPTED", "RETURNED"] as const;
export const homeworkReviewSchema = z.object({
  status: z.enum(HOMEWORK_REVIEW_STATUSES),
  teacherComment: z.string().trim().max(1000, "validation.tooLong").nullable().optional(),
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
