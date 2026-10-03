import { z } from "zod";

import { idSchema, passwordSchema, phoneSchema } from "./common";

export const loginSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const activeBranchSchema = z.object({
  branchId: idSchema.nullable(),
});
export type ActiveBranchInput = z.infer<typeof activeBranchSchema>;
