import { dayOffSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import {
  createDayOff,
  DAY_OFF_SORT_FIELDS,
  listDaysOff,
} from "@/server/services/settings/days-off.service";

export const GET = route({ permission: "settings.catalog" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: DAY_OFF_SORT_FIELDS,
    defaultSort: { field: "date", direction: "desc" },
  });
  return json(await listDaysOff(current.actor, query));
});

export const POST = route(
  { permission: "settings.catalog", body: dayOffSchema },
  async ({ current, body }) => json(await createDayOff(current.actor, body), { status: 201 }),
);
