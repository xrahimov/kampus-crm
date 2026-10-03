import { courseSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import {
  COURSE_SORT_FIELDS,
  createCourse,
  listCourses,
} from "@/server/services/settings/courses.service";

export const GET = route({ permission: "settings.catalog" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: COURSE_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  const archived = params.get("archived") === "true";
  return json(await listCourses(current.actor, query, { archived }));
});

export const POST = route(
  { permission: "settings.catalog", body: courseSchema },
  async ({ current, body }) => json(await createCourse(current.actor, body), { status: 201 }),
);
