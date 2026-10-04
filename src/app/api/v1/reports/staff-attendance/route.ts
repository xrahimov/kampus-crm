import { staffAttendanceFilterSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { getStaffAttendanceReport } from "@/server/services/attendance/staff-attendance.service";

import { parseQuery } from "../../finance/_query";

/** Reports → "Hodimlar davomati" (EXP §10): `?year&month&branchId&date`. */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(
    await getStaffAttendanceReport(
      current.actor,
      parseQuery(request, ["year", "month", "branchId", "date"], staffAttendanceFilterSchema),
    ),
  ),
);
