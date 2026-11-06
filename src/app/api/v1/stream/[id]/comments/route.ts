import { streamCommentSchema } from "@/lib/validation/stream";
import { json, route } from "@/server/http/handler";
import { addStaffComment } from "@/server/services/stream/stream.service";

type Params = { id: string };

/** A staff reply under a stream post (A-164). */
export const POST = route<typeof streamCommentSchema._output, Params>(
  { permission: "groups.attendance.mark", body: streamCommentSchema },
  async ({ current, params, body }) =>
    json(await addStaffComment(current.actor, params.id, body), { status: 201 }),
);
