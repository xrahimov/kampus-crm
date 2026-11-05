import { json, route } from "@/server/http/handler";
import { saveBoardImage } from "@/server/services/video/board.service";

type Params = { id: string };

/** The teacher's browser uploads the whiteboard as a PNG (raw body); it becomes a lesson material. */
export const POST = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params, request }) =>
    json(
      await saveBoardImage(current.actor, params.id, {
        contentType: request.headers.get("content-type") ?? "",
        body: request.body,
      }),
      { status: 201 },
    ),
);
