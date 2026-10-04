import { leadsReportFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getLeadsReport } from "@/server/services/reports/leads-report.service";

import { parseReport } from "../_period";

/** Reports → "Lidlar hisoboti" (EXP §10). */
export const GET = route({ permission: "reports.leads" }, async ({ current, request }) =>
  json(
    await getLeadsReport(
      current.actor,
      parseReport(request, ["sourceId"], leadsReportFilterSchema),
    ),
  ),
);
