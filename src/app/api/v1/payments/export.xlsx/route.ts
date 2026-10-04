import { PAYMENT_SORT_FIELDS, paymentFilterSchema } from "@/lib/validation/students";
import {
  columns,
  exportTranslator,
  PAYMENT_COLUMNS,
  paymentRows,
  sendWorkbook,
  wholeList,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listPayments } from "@/server/services/students/payments.service";

/** "Excelga eksport qilish" under a student's payment history and the payments log (EXP §6, §8). */
export const GET = route({ permission: "students.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: PAYMENT_SORT_FIELDS,
    defaultSort: { field: "paidAt", direction: "desc" },
  });
  const raw: Record<string, string | undefined> = {};
  for (const key of [
    "studentId",
    "groupId",
    "membershipId",
    "paymentMethodId",
    "receivedById",
    "from",
    "to",
  ]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = paymentFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const page = await listPayments(current.actor, query, filters.data);
  return sendWorkbook(
    request,
    t("excel.files.payments"),
    t("excel.files.payments"),
    columns(t, PAYMENT_COLUMNS, { fullName: 28, group: 20, comment: 30 }),
    paymentRows(page.items),
  );
});
