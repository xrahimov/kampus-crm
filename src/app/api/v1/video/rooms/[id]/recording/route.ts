import { json, route } from "@/server/http/handler";
import { saveRecording } from "@/server/services/materials/materials.service";

type Params = { id: string };

/**
 * The teacher's browser uploads its recording of the call as the raw request
 * body (video/webm or video/mp4), with the length in `?duration=<seconds>`.
 */
export const POST = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params, request }) =>
    json(
      await saveRecording(current.actor, params.id, {
        contentType: request.headers.get("content-type") ?? "",
        body: request.body,
        durationSec: Number(request.nextUrl.searchParams.get("duration") ?? 0) || 0,
      }),
      { status: 201 },
    ),
);
