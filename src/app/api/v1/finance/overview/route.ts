import { financePeriodSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { getFinanceOverview } from "@/server/services/finance/overview.service";

import { parseQuery } from "../_query";

/** "Umumiy raqamlar" and the charts: `?branchId&year&month&paymentMethodId` (EXP §9). */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) =>
  json(
    await getFinanceOverview(
      current.actor,
      parseQuery(request, ["branchId", "year", "month", "paymentMethodId"], financePeriodSchema),
    ),
  ),
);
