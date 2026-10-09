import { dashboardKpiSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { getRevenueForecast } from "@/server/services/finance/forecast.service";

import { parseQuery } from "../../finance/_query";

/** Revenue forecast for this month and the next (A-133): `?branchId`. */
export const GET = route({ permission: "dashboard.finance" }, async ({ current, request }) =>
  json(
    await getRevenueForecast(current.actor, parseQuery(request, ["branchId"], dashboardKpiSchema)),
  ),
);
