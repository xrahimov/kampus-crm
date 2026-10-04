import { actionLogFilterSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { ACTION_LOG_SORT_FIELDS, listActionLog } from "@/server/services/logs/logs.service";

import { parseQuery } from "../../finance/_query";

/** Settings → action feed (EXP §8 "payment-history" log). */
export const GET = route({ permission: "logs.view" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: ACTION_LOG_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const filters = parseQuery(request, ["entity", "actorId", "from", "to"], actionLogFilterSchema);
  return json(await listActionLog(current.actor, query, filters));
});
