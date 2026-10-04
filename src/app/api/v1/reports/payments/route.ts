import { reportPeriodSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getPaymentsReport } from "@/server/services/reports/payments-report.service";

import { parseReport } from "../_period";

/** Reports → "To'lovlar hisoboti" (EXP §10). */
export const GET = route({ permission: "reports.payments" }, async ({ current, request }) =>
  json(await getPaymentsReport(current.actor, parseReport(request, [], reportPeriodSchema))),
);
