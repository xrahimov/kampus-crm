import { STAFF_SORT_FIELDS, TEACHER_KINDS } from "@/lib/validation/staff";
import {
  columns,
  exportTranslator,
  sendWorkbook,
  TEACHER_COLUMNS,
  teacherRows,
  wholeList,
} from "@/server/excel/exports";
import { route } from "@/server/http/handler";
import { listTeachers } from "@/server/services/staff/teachers.service";

/** Teachers page EXCEL (EXP §4). */
export const GET = route({ permission: "teachers.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const tab = params.get("tab");
  const kind = (TEACHER_KINDS as readonly string[]).includes(tab ?? "")
    ? (tab as (typeof TEACHER_KINDS)[number])
    : "teachers";
  const t = await exportTranslator(request);
  const page = await listTeachers(current.actor, query, {
    kind,
    archived: params.get("archived") === "true",
  });
  return sendWorkbook(
    request,
    t("excel.files.teachers"),
    t("teachers.title"),
    columns(t, TEACHER_COLUMNS, { fullName: 28, groups: 30 }),
    teacherRows(t, page.items),
  );
});
