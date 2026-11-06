import { route } from "@/server/http/handler";
import { deleteComment } from "@/server/services/stream/stream.service";

type Params = { id: string };

/** Staff remove a comment from a post of their groups (A-164). */
export const DELETE = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await deleteComment(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
