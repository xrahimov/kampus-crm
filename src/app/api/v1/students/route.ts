import {
  STUDENT_SORT_FIELDS,
  studentCreateSchema,
  studentFilterSchema,
} from "@/lib/validation/students";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { createStudent, listStudents } from "@/server/services/students/students.service";

/** EXP §6 list: `?archived&courseId&schoolId&groupId&teacherId&groupStatus&paymentStatus` + list query. */
export const GET = route({ permission: "students.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: STUDENT_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
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
  return json(await listStudents(current.actor, query, filters.data));
});

/** The service decides who may create: `students.create`, or a teacher when the org switch allows it. */
export const POST = route({ body: studentCreateSchema }, async ({ current, body }) =>
  json(await createStudent(current.actor, body), { status: 201 }),
);
