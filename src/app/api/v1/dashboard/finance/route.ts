import { dashboardFinanceSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { getDashboardFinance } from "@/server/services/dashboard/finance.service";

import { parseQuery } from "../../finance/_query";

/** Dashboard finance cards and charts (EXP §1): `?branchId&year&month&paymentMethodId`. */
export const GET = route({ permission: "dashboard.finance" }, async ({ current, request }) =>
  json(
    await getDashboardFinance(
      current.actor,
      parseQuery(request, ["branchId", "year", "month", "paymentMethodId"], dashboardFinanceSchema),
    ),
  ),
);
