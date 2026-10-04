import { graduatesFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getGraduatesReport } from "@/server/services/reports/graduates.service";

import { parseReport } from "../_period";

/** Reports → "Bitiruvchilar hisoboti" (EXP §10). */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(
    await getGraduatesReport(
      current.actor,
      parseReport(request, ["groupId", "teacherId", "courseId", "result"], graduatesFilterSchema),
    ),
  ),
);
