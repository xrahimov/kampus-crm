import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema } from "./settings";

/* Lesson packages of a group that charges per package (A-178). */

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const price = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");

export const lessonPackageSchema = z.object({
  name,
  lessons: z.coerce
    .number()
    .int("validation.integer")
    .min(1, "validation.min")
    .max(500, "validation.max"),
  price,
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type LessonPackageInput = z.infer<typeof lessonPackageSchema>;

export const lessonPackageUpdateSchema = lessonPackageSchema.partial();
export type LessonPackageUpdateInput = z.infer<typeof lessonPackageUpdateSchema>;

/** Selling a package to a member: one payment of the package's price plus the credits. */
export const sellPackageSchema = z.object({
  membershipId: idSchema,
  packageId: idSchema,
  paymentMethodId: idSchema,
  paidAt: dateOnlySchema,
  comment: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
});
export type SellPackageInput = z.infer<typeof sellPackageSchema>;
