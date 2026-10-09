import { DEBT_SORT_FIELDS, debtFilterSchema } from "@/lib/validation/debts";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { listDebtCases } from "@/server/services/debts/debts.service";

/** The debtor list (A-112): `?branchId&status&q&sort&page`, longest overdue first. */
export const GET = route({ permission: "payments.create" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: DEBT_SORT_FIELDS,
    defaultSort: { field: "openedAt", direction: "asc" },
  });
  const filters = debtFilterSchema.safeParse({
    branchId: params.get("branchId") ?? undefined,
    status: params.get("status") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listDebtCases(current.actor, query, filters.data));
});
