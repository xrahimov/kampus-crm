import { z } from "zod";

/** Uzbek mobile numbers as the reference shows them: +998 and nine digits. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+998\d{9}$/, "validation.phone"));

export const passwordSchema = z
  .string()
  .min(8, "validation.passwordMin")
  .max(128, "validation.passwordMax");

export const idSchema = z.string().min(1).max(64);

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * One query contract for every list endpoint:
 * `?page=1&pageSize=20&sort=field:asc&q=text` plus endpoint-specific filters.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .regex(/^[a-zA-Z_.]+:(asc|desc)$/, "validation.sort")
    .optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
