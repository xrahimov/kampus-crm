import { DEBT_SORT_FIELDS, debtFilterSchema } from "@/lib/validation/debts";
import {
  columns,
  DEBT_COLUMNS,
  debtRows,
  exportTranslator,
  sendWorkbook,
  wholeList,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listDebtCases } from "@/server/services/debts/debts.service";

/** EXCEL on the debtor list: the rows as shown, with the current filters (A-112). */
export const GET = route({ permission: "payments.create" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: DEBT_SORT_FIELDS,
    defaultSort: { field: "openedAt", direction: "asc" },
  });
  const filters = debtFilterSchema.safeParse({
    branchId: params.get("branchId") ?? undefined,
    status: params.get("status") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const list = await listDebtCases(current.actor, query, filters.data);
  return sendWorkbook(
    request,
    t("excel.files.debtors"),
    t("excel.files.debtors"),
    columns(t, DEBT_COLUMNS, { fullName: 28, groups: 28, lastContact: 30 }),
    debtRows(t, list.items),
  );
});
