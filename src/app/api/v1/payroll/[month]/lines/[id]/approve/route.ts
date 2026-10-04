import { json, route } from "@/server/http/handler";
import { approvePayrollLine } from "@/server/services/finance/payroll.service";

import { parseMonth } from "../../../../_month";

/** "Tasdiqlash" on one payroll row. */
export const POST = route<undefined, { month: string; id: string }>(
  { permission: "finance.payroll.approve" },
  async ({ current, params }) =>
    json(await approvePayrollLine(current.actor, parseMonth(params.month), params.id)),
);
