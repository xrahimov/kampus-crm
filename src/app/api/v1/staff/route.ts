import { STAFF_SORT_FIELDS, staffCreateSchema } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { createStaff, listStaff } from "@/server/services/staff/staff.service";

/** EXP §8 staff list: `?role=CODE`, `?archived=true`, plus the common list query. */
export const GET = route({ permission: "staff.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: STAFF_SORT_FIELDS,
    defaultSort: { field: "fullName", direction: "asc" },
  });
  const roleCode = params.get("role") ?? undefined;
  const archived = params.get("archived") === "true";
  return json(await listStaff(current.actor, "staff", query, { roleCode, archived }));
});

export const POST = route(
  { permission: "staff.create", body: staffCreateSchema },
  async ({ current, body }) =>
    json(await createStaff(current.actor, "staff", body), { status: 201 }),
);
