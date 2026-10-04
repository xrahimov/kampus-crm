import { json, route } from "@/server/http/handler";
import { listPayrollRuns } from "@/server/services/finance/payroll.service";

/** "Ish haqi hisobotlari": computed months with their totals. */
export const GET = route({ permission: "finance.view" }, async ({ current }) =>
  json(await listPayrollRuns(current.actor)),
);
