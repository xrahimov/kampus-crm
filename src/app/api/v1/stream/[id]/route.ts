import { streamPostSchema } from "@/lib/validation/stream";
import { json, route } from "@/server/http/handler";
import { deletePost, updatePost } from "@/server/services/stream/stream.service";

type Params = { id: string };

/** Edits, pins or locks a stream post (A-164). */
export const PUT = route<typeof streamPostSchema._output, Params>(
  { permission: "groups.attendance.mark", body: streamPostSchema },
  async ({ current, params, body }) => json(await updatePost(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await deletePost(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
