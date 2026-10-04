import { STUDENT_SORT_FIELDS, studentFilterSchema } from "@/lib/validation/students";
import {
  columns,
  exportTranslator,
  sendWorkbook,
  STUDENT_COLUMNS,
  studentRows,
  wholeList,
} from "@/server/excel/exports";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { listStudents } from "@/server/services/students/students.service";

/** Students page EXCEL (EXP §6): the current filters, every page. */
export const GET = route({ permission: "students.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = wholeList(params, {
    sortable: STUDENT_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const raw: Record<string, string | undefined> = {};
  for (const key of [
    "archived",
    "courseId",
    "schoolId",
    "groupId",
    "teacherId",
    "groupStatus",
    "paymentStatus",
  ]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = studentFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  const t = await exportTranslator(request);
  const page = await listStudents(current.actor, query, filters.data);
  return sendWorkbook(
    request,
    t("excel.files.students"),
    t("students.title"),
    columns(t, STUDENT_COLUMNS, { fullName: 28, groups: 30, courses: 24 }),
    studentRows(t, page.items),
  );
});
