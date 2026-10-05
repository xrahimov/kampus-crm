import { json, route } from "@/server/http/handler";
import { resetStudentLink } from "@/server/services/video/video.service";

type Params = { id: string };

/** Replaces a student's video lesson link; the old one stops working. */
export const POST = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => json(await resetStudentLink(current.actor, params.id)),
);
