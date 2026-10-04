import { PAYMENTS_REPORT_TABS, reportPeriodSchema } from "@/lib/validation/reports";
import { columns, exportTranslator, sendWorkbook } from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getPaymentsReport } from "@/server/services/reports/payments-report.service";

import { parseReport } from "../../_period";

/** EXCEL on the payments report: the O'QITUVCHILAR or XODIMLAR table (`?tab=`). */
export const GET = route({ permission: "reports.payments" }, async ({ current, request }) => {
  const report = await getPaymentsReport(
    current.actor,
    parseReport(request, [], reportPeriodSchema),
  );
  const tabRaw = request.nextUrl.searchParams.get("tab") ?? "teachers";
  const tab = (PAYMENTS_REPORT_TABS as readonly string[]).includes(tabRaw) ? tabRaw : "teachers";
  const t = await exportTranslator(request);
  const file = `${t("excel.files.paymentsReport")}-${report.year}-${String(report.month).padStart(2, "0")}`;
  if (tab === "staff") {
    return sendWorkbook(
      request,
      file,
      t("reports.payments.tabs.staff"),
      columns(t, ["index", "fullName", "roles", "paymentsCount", "totalPayments", "refunded"], {
        fullName: 28,
      }),
      report.staff.map((s, i) => ({
        index: i + 1,
        fullName: s.fullName,
        roles: s.roles.join(", "),
        paymentsCount: s.paymentsCount,
        totalPayments: s.totalPayments,
        refunded: s.refunds,
      })),
    );
  }
  return sendWorkbook(
    request,
    file,
    t("reports.payments.tabs.teachers"),
    columns(
      t,
      ["index", "fullName", "groupsCount", "courses", "studentsCount", "totalPayments", "debt"],
      { fullName: 28, courses: 30 },
    ),
    report.teachers.map((r, i) => ({
      index: i + 1,
      fullName: r.fullName,
      groupsCount: r.groupsCount,
      courses: r.courses.join(", "),
      studentsCount: r.studentsCount,
      totalPayments: r.totalPayments,
      debt: r.debt,
    })),
  );
});
