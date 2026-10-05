import { videoLinksSmsSchema } from "@/lib/validation/video";
import { json, route } from "@/server/http/handler";
import { smsStudentLinks } from "@/server/services/video/video.service";

type Params = { id: string };

/** Texts each student their personal link. */
export const POST = route<typeof videoLinksSmsSchema._output, Params>(
  { permission: "sms.send", body: videoLinksSmsSchema },
  async ({ current, params, body }) => json(await smsStudentLinks(current.actor, params.id, body)),
);
