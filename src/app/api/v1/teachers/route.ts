import { STAFF_SORT_FIELDS, staffCreateSchema, TEACHER_KINDS } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { createTeacher, listTeachers } from "@/server/services/staff/teachers.service";

/** EXP §4 teachers list: `?tab=teachers|support`, `?archived=true`, plus the common list query. */
export const GET = route({ permission: "teachers.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const tab = params.get("tab");
  const kind = (TEACHER_KINDS as readonly string[]).includes(tab ?? "")
    ? (tab as (typeof TEACHER_KINDS)[number])
    : "teachers";
  const archived = params.get("archived") === "true";
  return json(await listTeachers(current.actor, query, { kind, archived }));
});

export const POST = route(
  { permission: "teachers.create", body: staffCreateSchema },
  async ({ current, body }) => json(await createTeacher(current.actor, body), { status: 201 }),
);
