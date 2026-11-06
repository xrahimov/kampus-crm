import { streamPostSchema } from "@/lib/validation/stream";
import { json, route } from "@/server/http/handler";
import { createPost, listGroupStream } from "@/server/services/stream/stream.service";

type Params = { id: string };

/** Group → Stream: the posts with their comments (A-164). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupStream(current.actor, params.id)),
);

/** A new post to the group; its students hear about it on Telegram. */
export const POST = route<typeof streamPostSchema._output, Params>(
  { permission: "groups.attendance.mark", body: streamPostSchema },
  async ({ current, params, body }) =>
    json(await createPost(current.actor, params.id, body), { status: 201 }),
);
