import { route } from "@/server/http/handler";
import { deleteAnnouncement } from "@/server/services/announcements/announcements.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "announcements.create" },
  async ({ current, params }) => {
    await deleteAnnouncement(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
