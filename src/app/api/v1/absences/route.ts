import { ABSENCE_SORT_FIELDS, absenceFilterSchema } from "@/lib/validation/absences";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { listAbsenceCases } from "@/server/services/absences/absences.service";

/** The absence list (A-125): `?branchId&status&reason&q&sort&page`, longest away first. */
export const GET = route({ permission: "students.update" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: ABSENCE_SORT_FIELDS,
    defaultSort: { field: "sinceAt", direction: "asc" },
  });
  const filters = absenceFilterSchema.safeParse({
    branchId: params.get("branchId") ?? undefined,
    status: params.get("status") ?? undefined,
    reason: params.get("reason") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listAbsenceCases(current.actor, query, filters.data));
});
