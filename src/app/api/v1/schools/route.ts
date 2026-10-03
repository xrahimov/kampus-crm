import { schoolSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import {
  createSchool,
  listSchools,
  SCHOOL_SORT_FIELDS,
} from "@/server/services/settings/schools.service";

export const GET = route({ permission: "settings.catalog" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: SCHOOL_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  return json(await listSchools(current.actor, query));
});

export const POST = route(
  { permission: "settings.catalog", body: schoolSchema },
  async ({ current, body }) => json(await createSchool(current.actor, body), { status: 201 }),
);
