import { cashDaySchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { previewCashDay } from "@/server/services/finance/cash-close.service";

import { parseQuery } from "../../finance/_query";

/** The cashier's own day as it stands: `?branchId&date` (A-122). */
export const GET = route({ permission: "payments.create" }, async ({ current, request }) =>
  json(
    await previewCashDay(current.actor, parseQuery(request, ["branchId", "date"], cashDaySchema)),
  ),
);
