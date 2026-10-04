import { studentsReportFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getStudentsReport } from "@/server/services/reports/students-report.service";

import { parseReport } from "../_period";

const STUDENTS_REPORT_KEYS = ["from", "to", "groupId", "teacherId", "status", "page"];

/** Reports → "O'quvchilar hisoboti" (EXP §10). */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(
    await getStudentsReport(
      current.actor,
      parseReport(request, STUDENTS_REPORT_KEYS, studentsReportFilterSchema),
    ),
  ),
);
