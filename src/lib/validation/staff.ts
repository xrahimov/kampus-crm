import { z } from "zod";

import { PERMISSIONS, type Permission } from "@/lib/rbac/permissions";

import { idSchema, passwordSchema, phoneSchema } from "./common";
import { dateOnlySchema } from "./settings";

/* Staff, teachers and roles (EXP §4, §8 Staff, §8 Roles). Messages are i18n keys. */

export const GENDERS = ["MALE", "FEMALE"] as const;
export const SALARY_METHODS = ["PERCENT", "MONTHLY", "PER_LESSON", "PER_STUDENT"] as const;
export type SalaryMethod = (typeof SALARY_METHODS)[number];

const fullName = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const money = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");
const percent = z.coerce.number().min(0, "validation.min").max(100, "validation.max");

/** Empty form fields arrive as "" and mean "not set"; the literal must win before coercion. */
const blank = z.literal("").transform(() => null);
const optionalDate = z.union([blank, z.null(), dateOnlySchema]).optional();
const optionalMoney = z.union([blank, z.null(), money]).optional();
const optionalPercent = z.union([blank, z.null(), percent]).optional();

const salaryFields = {
  salaryMethod: z.enum(SALARY_METHODS).nullable().optional(),
  fixedSalary: optionalMoney,
  percentShare: optionalPercent,
  perLessonFee: optionalMoney,
  perStudentFee: optionalMoney,
};

/** The amount field that belongs to each salary method (EXP §4). */
export const SALARY_AMOUNT_FIELD = {
  PERCENT: "percentShare",
  MONTHLY: "fixedSalary",
  PER_LESSON: "perLessonFee",
  PER_STUDENT: "perStudentFee",
} as const satisfies Record<SalaryMethod, keyof typeof salaryFields>;

const staffBase = z.object({
  fullName,
  phone: phoneSchema,
  gender: z.enum(GENDERS).default("MALE"),
  birthDate: optionalDate,
  hireDate: optionalDate,
  photoUrl: z.string().max(500).nullable().optional(),
  roleCodes: z.array(z.string().min(1).max(64)).min(1, "validation.rolesMin").max(10),
  branchIds: z.array(idSchema).min(1, "validation.branchesMin").max(50),
  ...salaryFields,
});

/** Create: a password is required. */
export const staffCreateSchema = staffBase.extend({ password: passwordSchema });
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

/** Update: every field optional; an empty password means "keep the current one". */
export const staffUpdateSchema = staffBase.partial().extend({
  password: passwordSchema.optional().or(z.literal("").transform(() => undefined)),
  isArchived: z.boolean().optional(),
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

export const STAFF_SORT_FIELDS = [
  "fullName",
  "phone",
  "hireDate",
  "birthDate",
  "createdAt",
] as const;
export type StaffSortField = (typeof STAFF_SORT_FIELDS)[number];

/** Teachers are staff whose role is fixed by the tab they are created from. */
export const TEACHER_KINDS = ["teachers", "support"] as const;
export type TeacherKind = (typeof TEACHER_KINDS)[number];
export const TEACHER_KIND_ROLE = { teachers: "TEACHER", support: "SUPPORT_TEACHER" } as const;

// --- Roles (EXP §8 Roles) ----------------------------------------------------

const permissionSchema = z
  .string()
  .refine((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p), {
    message: "validation.permission",
  });

export const roleSchema = z.object({
  name: z.string().trim().min(1, "validation.required").max(80, "validation.tooLong"),
  isActive: z.boolean().default(true),
  permissions: z.array(permissionSchema).max(PERMISSIONS.length),
});
export type RoleInput = z.infer<typeof roleSchema>;
export const roleUpdateSchema = roleSchema.partial();
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
