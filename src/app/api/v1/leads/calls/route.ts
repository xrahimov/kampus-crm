import { LEAD_CALL_SORT_FIELDS, leadCallsFilterSchema } from "@/lib/validation/leads";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { listLeadCalls } from "@/server/services/leads/follow-up.service";

/** "Calls today" (A-126): `?ownerId&range&q&sort&page`, the oldest planned date first. */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: LEAD_CALL_SORT_FIELDS,
    defaultSort: { field: "nextContactAt", direction: "asc" },
  });
  const filters = leadCallsFilterSchema.safeParse({
    ownerId: params.get("ownerId") ?? undefined,
    range: params.get("range") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listLeadCalls(current.actor, query, filters.data));
});
