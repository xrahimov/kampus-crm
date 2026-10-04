import { churnFilterSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getChurnReport } from "@/server/services/reports/churn.service";

import { parseQuery } from "../../../finance/_query";

/** EXCEL: "Ketgan talabalar ro'yxati". */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) => {
  const report = await getChurnReport(
    current.actor,
    parseQuery(
      request,
      ["from", "to", "branchId", "courseId", "teacherId", "groupId", "reason", "discount"],
      churnFilterSchema,
    ),
  );
  const t = await exportTranslator(request);
  return sendWorkbook(
    request,
    `${t("excel.files.churn")}-${report.from}-${report.to}`,
    t("reports.items.churn"),
    columns(
      t,
      [
        "index",
        "fullName",
        "group",
        "course",
        "discount",
        "teacher",
        "reason",
        "leftAt",
        "leftBy",
        "note",
      ],
      { fullName: 28, note: 30 },
    ),
    report.rows.map((r, i) => ({
      index: i + 1,
      fullName: r.fullName,
      group: r.groupName,
      course: r.courseName,
      discount: r.hasDiscount ? t("common.yes") : t("common.no"),
      teacher: r.teacherName,
      reason: r.reason,
      leftAt: r.leftAt,
      leftBy: r.leftByName,
      note: r.note,
    })),
  );
});
