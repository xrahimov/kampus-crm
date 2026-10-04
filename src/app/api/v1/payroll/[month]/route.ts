import { payrollSaveSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { getPayroll, savePayroll } from "@/server/services/finance/payroll.service";

import { parseMonth } from "../_month";

type Params = { month: string };

/** One month's payroll, computed on first request. `:month` is YYYY-MM or YYYY-MM-01. */
export const GET = route<undefined, Params>(
  { permission: "finance.view" },
  async ({ current, params }) => json(await getPayroll(current.actor, parseMonth(params.month))),
);

/** "Vaqtincha saqlash" / "Saqlash". */
export const PUT = route<typeof payrollSaveSchema._output, Params>(
  { permission: "finance.update", body: payrollSaveSchema },
  async ({ current, body, params }) =>
    json(await savePayroll(current.actor, parseMonth(params.month), body.status)),
);
