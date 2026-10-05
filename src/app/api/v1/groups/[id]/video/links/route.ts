import { json, route } from "@/server/http/handler";
import { listStudentLinks } from "@/server/services/video/video.service";

type Params = { id: string };

/** Students' personal video lesson links. */
export const GET = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => json(await listStudentLinks(current.actor, params.id)),
);
