import { cashCloseFilterSchema, cashCloseSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { closeCashDay, listCashCloses } from "@/server/services/finance/cash-close.service";

import { parseQuery } from "../finance/_query";

/** Day closes in scope: `?branchId&year&month&cashierId` (A-122). The service decides who sees whose. */
export const GET = route({}, async ({ current, request }) =>
  json(
    await listCashCloses(
      current.actor,
      parseQuery(request, ["branchId", "year", "month", "cashierId"], cashCloseFilterSchema),
    ),
  ),
);

/** "Close the day": the cashier's own day in one branch with the cash counted. */
export const POST = route<typeof cashCloseSchema._output>(
  { permission: "payments.create", body: cashCloseSchema },
  async ({ current, body }) => json(await closeCashDay(current.actor, body), { status: 201 }),
);
