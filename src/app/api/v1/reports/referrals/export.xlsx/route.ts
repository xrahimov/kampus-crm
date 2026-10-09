import { referralsReportFilterSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getReferralsReport } from "@/server/services/students/referrals.service";

import { parseReport } from "../../_period";

export const GET = route({ permission: "reports.leads" }, async ({ current, request }) => {
  const report = await getReferralsReport(
    current.actor,
    parseReport(request, [], referralsReportFilterSchema),
  );
  const t = await exportTranslator(request);
  return sendWorkbook(
    request,
    `${t("excel.files.referralsReport")}-${report.year}-${String(report.month).padStart(2, "0")}`,
    t("reports.items.referrals"),
    columns(t, ["index", "fullName", "leads", "joined", "coins", "bonus"], { fullName: 28 }),
    report.rows.map((r, i) => ({
      index: i + 1,
      fullName: r.fullName,
      leads: r.leads,
      joined: r.joined,
      coins: r.coins,
      bonus: r.bonus,
    })),
  );
});
