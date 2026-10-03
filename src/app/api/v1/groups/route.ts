import { GROUP_SORT_FIELDS, groupFilterSchema, groupSchema } from "@/lib/validation/groups";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { createGroup, listGroups } from "@/server/services/groups/groups.service";

/** EXP §5 list: `?status=ACTIVE|ARCHIVED|TRIAL|FROZEN|ALL&teacherId&courseId&weekdayPattern` + list query. */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
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
  return json(await listGroups(current.actor, query, filters.data));
});

export const POST = route(
  { permission: "groups.create", body: groupSchema },
  async ({ current, body }) => json(await createGroup(current.actor, body), { status: 201 }),
);
