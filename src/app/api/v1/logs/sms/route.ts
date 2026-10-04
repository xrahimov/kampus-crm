import { smsLogFilterSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { SMS_LOG_SORT_FIELDS, listSmsLog } from "@/server/services/sms/sms.service";

import { parseQuery } from "../../finance/_query";

/** Settings → "Yuborilgan SMSlar" (EXP §8 SMS log). */
export const GET = route({ permission: "logs.view" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: SMS_LOG_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const filters = parseQuery(request, ["from", "to", "status", "sentBy"], smsLogFilterSchema);
  return json(await listSmsLog(current.actor, query, filters));
});
