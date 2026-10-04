import { graduatesFilterSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getGraduatesReport } from "@/server/services/reports/graduates.service";

import { parseReport } from "../../_period";

export const GET = route({ permission: "reports.view" }, async ({ current, request }) => {
  const report = await getGraduatesReport(
    current.actor,
    parseReport(request, ["groupId", "teacherId", "courseId", "result"], graduatesFilterSchema),
  );
  const t = await exportTranslator(request);
  const yesNo = (v: boolean | null) => (v === null ? null : v ? t("common.yes") : t("common.no"));
  return sendWorkbook(
    request,
    `${t("excel.files.graduates")}-${report.year}-${String(report.month).padStart(2, "0")}`,
    t("reports.items.graduates"),
    columns(
      t,
      [
        "index",
        "fullName",
        "group",
        "branch",
        "teacher",
        "graduatedAt",
        "examResult",
        "ielts",
        "cefr",
        "university",
        "employed",
      ],
      { fullName: 28 },
    ),
    report.rows.map((r, i) => ({
      index: i + 1,
      fullName: r.fullName,
      group: r.groupName,
      branch: r.branchName,
      teacher: r.teacherName,
      graduatedAt: r.graduatedAt,
      examResult: r.examResult,
      ielts: r.result?.ieltsScore ?? null,
      cefr: r.result?.cefrLevel ?? null,
      university: yesNo(r.result?.university ?? null),
      employed: yesNo(r.result?.employed ?? null),
    })),
  );
});
