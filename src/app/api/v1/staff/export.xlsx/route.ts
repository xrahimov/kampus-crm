import { STAFF_SORT_FIELDS } from "@/lib/validation/staff";
import {
  columns,
  exportTranslator,
  sendWorkbook,
  STAFF_COLUMNS,
  staffRows,
  wholeList,
} from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { listStaff } from "@/server/services/staff/staff.service";

/** Settings → Staff EXCEL (EXP §8). */
export const GET = route({ permission: "staff.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const t = await exportTranslator(request);
  const page = await listStaff(current.actor, "staff", query, {
    roleCode: params.get("role") ?? undefined,
    archived: params.get("archived") === "true",
  });
  return sendWorkbook(
    request,
    t("excel.files.staff"),
    t("staff.title"),
    columns(t, STAFF_COLUMNS, { fullName: 28, roles: 24 }),
    staffRows(t, page.items),
  );
});
