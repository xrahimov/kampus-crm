import { leadsReportFilterSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getLeadsReport } from "@/server/services/reports/leads-report.service";

import { parseReport } from "../../_period";

export const GET = route({ permission: "reports.leads" }, async ({ current, request }) => {
  const report = await getLeadsReport(
    current.actor,
    parseReport(request, ["sourceId"], leadsReportFilterSchema),
  );
  const t = await exportTranslator(request);
  return sendWorkbook(
    request,
    `${t("excel.files.leadsReport")}-${report.year}-${String(report.month).padStart(2, "0")}`,
    t("reports.items.leads"),
    columns(
      t,
      [
        "index",
        "fullName",
        "phone",
        "column",
        "source",
        "teacher",
        "status",
        "createdBy",
        "createdAt",
        "convertedAt",
      ],
      { fullName: 28 },
    ),
    report.rows.map((r, i) => ({
      index: i + 1,
      fullName: r.fullName,
      phone: r.phone,
      column: r.columnName,
      source: r.sourceName,
      teacher: r.teacherName,
      status: r.converted ? t("reports.leads.funnel.CONVERTED") : t(`leads.statuses.${r.status}`),
      createdBy: r.createdByName,
      createdAt: r.createdAt.slice(0, 10),
      convertedAt: r.convertedAt ? r.convertedAt.slice(0, 10) : null,
    })),
  );
});
