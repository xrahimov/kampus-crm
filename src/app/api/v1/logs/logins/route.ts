import { loginLogFilterSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { LOGIN_LOG_SORT_FIELDS, listLoginLogs } from "@/server/services/logs/logs.service";

import { parseQuery } from "../../finance/_query";

/** Settings → "Tizimga kirishlar" (EXP §8 Login log). */
export const GET = route({ permission: "logs.view" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: LOGIN_LOG_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const filters = parseQuery(request, ["success", "from", "to"], loginLogFilterSchema);
  return json(await listLoginLogs(current.actor, query, filters));
});
