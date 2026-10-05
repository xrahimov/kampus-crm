import { startVideoSchema } from "@/lib/validation/video";
import { json, route } from "@/server/http/handler";
import { getGroupVideo, startVideoRoom } from "@/server/services/video/video.service";

type Params = { id: string };

/** The group page's video lesson card. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getGroupVideo(current.actor, params.id)),
);

/** Starts the group's call, or returns the one already running. */
export const POST = route<typeof startVideoSchema._output, Params>(
  { permission: "groups.attendance.mark", body: startVideoSchema },
  async ({ current, params, body }) =>
    json(await startVideoRoom(current.actor, params.id, body), { status: 201 }),
);
