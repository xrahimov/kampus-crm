import { dashboardKpiSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { getDashboardKpis } from "@/server/services/dashboard/kpis.service";

import { parseQuery } from "../../finance/_query";

/** The twelve dashboard cards (EXP §1): `?branchId`. */
export const GET = route({ permission: "dashboard.view" }, async ({ current, request }) =>
  json(
    await getDashboardKpis(current.actor, parseQuery(request, ["branchId"], dashboardKpiSchema)),
  ),
);
