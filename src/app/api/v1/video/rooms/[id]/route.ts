import { json, route } from "@/server/http/handler";
import { getVideoRoom } from "@/server/services/video/video.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getVideoRoom(current.actor, params.id)),
);
