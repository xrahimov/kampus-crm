import { exportTranslator, gridExport, sendWorkbook } from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";

/** Group detail → GRADES tab EXCEL (EXP §5): one month of the grid, `?month=YYYY-MM`. */
export const GET = route<undefined, { id: string }>(
  { permission: "groups.view" },
  async ({ current, request, params }) => {
    const month = request.nextUrl.searchParams.get("month") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw AppError.validation({ month: ["validation.date"] });
    const t = await exportTranslator(request);
    const grid = await gridExport(current.actor, t, params.id, month, "grades");
    return sendWorkbook(
      request,
      `${t("excel.files.grades")}-${month}`,
      month,
      grid.columns,
      grid.rows,
    );
  },
);
