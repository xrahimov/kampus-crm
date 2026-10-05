import { route } from "@/server/http/handler";
import { endVideoRoom } from "@/server/services/video/video.service";

type Params = { id: string };

export const POST = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await endVideoRoom(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
