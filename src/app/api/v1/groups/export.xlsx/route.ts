import { GROUP_SORT_FIELDS, groupFilterSchema } from "@/lib/validation/groups";
import {
  columns,
  exportTranslator,
  GROUP_COLUMNS,
  groupRows,
  sendWorkbook,
  wholeList,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listGroups } from "@/server/services/groups/groups.service";

/** Groups page EXCEL (EXP §5). */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: GROUP_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const filters = groupFilterSchema.safeParse({
    status: params.get("status") ?? undefined,
    teacherId: params.get("teacherId") ?? undefined,
    courseId: params.get("courseId") ?? undefined,
    weekdayPattern: params.get("weekdayPattern") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const page = await listGroups(current.actor, query, filters.data);
  return sendWorkbook(
    request,
    t("excel.files.groups"),
    t("groups.title"),
    columns(t, GROUP_COLUMNS, { name: 24, teachers: 28, time: 16 }),
    groupRows(t, page.items),
  );
});
