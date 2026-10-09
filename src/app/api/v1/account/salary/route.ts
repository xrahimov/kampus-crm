import { payrollMonthSchema } from "@/lib/validation/finance";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { getMySalary } from "@/server/services/finance/my-salary.service";
import { tashkentToday } from "@/server/services/leads/shared";

/** "My salary" (A-127): the signed-in person's own pay, `?month=YYYY-MM` (default: this month). */
export const GET = route({}, async ({ current, request }) => {
  const raw = request.nextUrl.searchParams.get("month") ?? tashkentToday().slice(0, 7);
  const month = payrollMonthSchema.safeParse(raw);
  if (!month.success) throw AppError.validation({ month: ["validation.date"] });
  return json(await getMySalary(current.actor, month.data));
});
