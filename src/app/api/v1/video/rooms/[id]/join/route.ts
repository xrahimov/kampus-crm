import { json, route } from "@/server/http/handler";
import { joinVideoRoomAsStaff } from "@/server/services/video/video.service";

type Params = { id: string };

/** A staff member enters the call and gets the credentials for the sync endpoint. */
export const POST = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await joinVideoRoomAsStaff(current.actor, params.id)),
);
