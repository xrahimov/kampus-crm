import { statisticsFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getCenterStatistics } from "@/server/services/reports/statistics.service";

import { parseReport } from "../_period";

/** Reports → "Markaz Faoliyati Statistikasi" (EXP §10): `?view=monthly|weekly|daily&date`. */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(
    await getCenterStatistics(
      current.actor,
      parseReport(request, ["view", "date"], statisticsFilterSchema),
    ),
  ),
);
