import {
  columns,
  exportTranslator,
  PAYROLL_COLUMNS,
  payrollRows,
  sendWorkbook,
} from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { getPayroll } from "@/server/services/finance/payroll.service";

import { parseMonth } from "../../_month";

/** Payroll EXCEL (EXP §9 salary detail). */
export const GET = route<undefined, { month: string }>(
  { permission: "finance.view" },
  async ({ current, request, params }) => {
    const t = await exportTranslator(request);
    const run = await getPayroll(current.actor, parseMonth(params.month));
    return sendWorkbook(
      request,
      `${t("excel.files.payroll")}-${run.month}`,
      run.month,
      columns(t, PAYROLL_COLUMNS, { fullName: 28, roles: 20 }),
      payrollRows(t, run),
    );
  },
);
