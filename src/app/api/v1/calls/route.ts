import { callFilterSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { CALL_SORT_FIELDS, listCalls } from "@/server/services/calls/calls.service";

import { parseQuery } from "../finance/_query";

/** "Qo'ng'iroqlar" (EXP §8 Calls): `?direction&status&from&to&q`. */
export const GET = route({ permission: "logs.view" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: CALL_SORT_FIELDS,
    defaultSort: { field: "startedAt", direction: "desc" },
  });
  const filters = parseQuery(request, ["direction", "status", "from", "to"], callFilterSchema);
  return json(await listCalls(current.actor, query, filters));
});
