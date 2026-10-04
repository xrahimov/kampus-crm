import { payrollMonthSchema } from "@/lib/validation/finance";
import { AppError } from "@/server/errors/app-error";

/** `:month` is YYYY-MM or YYYY-MM-01 (the reference's "/finance/salary-detail/:YYYY-MM-01"). */
export function parseMonth(value: string): string {
  const parsed = payrollMonthSchema.safeParse(value);
  if (!parsed.success) throw AppError.validation({ month: ["validation.date"] });
  return parsed.data;
}
