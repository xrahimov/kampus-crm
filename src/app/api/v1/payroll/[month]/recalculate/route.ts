import { json, route } from "@/server/http/handler";
import { recalculatePayroll } from "@/server/services/finance/payroll.service";

import { parseMonth } from "../../_month";

/** "Qayta hisoblash": recomputes the lines that are not approved. */
export const POST = route<undefined, { month: string }>(
  { permission: "finance.update" },
  async ({ current, params }) =>
    json(await recalculatePayroll(current.actor, parseMonth(params.month))),
);
