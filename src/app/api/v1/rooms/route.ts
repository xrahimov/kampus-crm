import { roomSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import { createRoom, listRooms, ROOM_SORT_FIELDS } from "@/server/services/settings/rooms.service";

export const GET = route({ permission: "settings.catalog" }, async ({ current, request }) => {
  const query = parseListQuery(request.nextUrl.searchParams, {
    sortable: ROOM_SORT_FIELDS,
    defaultSort: { field: "name", direction: "asc" },
  });
  return json(await listRooms(current.actor, query));
});

export const POST = route(
  { permission: "settings.catalog", body: roomSchema },
  async ({ current, body }) => json(await createRoom(current.actor, body), { status: 201 }),
);
