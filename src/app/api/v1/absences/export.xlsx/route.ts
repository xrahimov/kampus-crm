import { ABSENCE_SORT_FIELDS, absenceFilterSchema } from "@/lib/validation/absences";
import {
  ABSENCE_COLUMNS,
  absenceRows,
  columns,
  exportTranslator,
  sendWorkbook,
  wholeList,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listAbsenceCases } from "@/server/services/absences/absences.service";

/** EXCEL on the absence list: the rows as shown, with the current filters (A-125). */
export const GET = route({ permission: "students.update" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: ABSENCE_SORT_FIELDS,
    defaultSort: { field: "sinceAt", direction: "asc" },
  });
  const filters = absenceFilterSchema.safeParse({
    branchId: params.get("branchId") ?? undefined,
    status: params.get("status") ?? undefined,
    reason: params.get("reason") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const list = await listAbsenceCases(current.actor, query, filters.data);
  return sendWorkbook(
    request,
    t("excel.files.absences"),
    t("excel.files.absences"),
    columns(t, ABSENCE_COLUMNS, { fullName: 28, group: 24, teacher: 24, lastContact: 30 }),
    absenceRows(t, list.items),
  );
});
