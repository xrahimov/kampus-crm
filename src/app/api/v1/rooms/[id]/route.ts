import { roomUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { deleteRoom, updateRoom } from "@/server/services/settings/rooms.service";

type Params = { id: string };

export const PATCH = route<typeof roomUpdateSchema._output, Params>(
  { permission: "settings.catalog", body: roomUpdateSchema },
  async ({ current, body, params }) => json(await updateRoom(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteRoom(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
