import { financePlanSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { getFinancePlan } from "@/server/services/finance/overview.service";

import { parseQuery } from "../_query";

/** The monthly plan: `?branchId&year&month&effective=1|0` ("Tasir vaqti"). */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) =>
  json(
    await getFinancePlan(
      current.actor,
      parseQuery(request, ["branchId", "year", "month", "effective"], financePlanSchema),
    ),
  ),
);
