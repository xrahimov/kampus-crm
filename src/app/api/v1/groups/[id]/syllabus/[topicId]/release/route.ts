import { topicReleaseSchema } from "@/lib/validation/topic-content";
import { json, route } from "@/server/http/handler";
import { setTopicRelease } from "@/server/services/settings/topic-content.service";

type Params = { id: string; topicId: string };

/** When this group's students may open the topic's content (A-157). */
export const PUT = route<typeof topicReleaseSchema._output, Params>(
  { permission: "groups.attendance.mark", body: topicReleaseSchema },
  async ({ current, body, params }) =>
    json(await setTopicRelease(current.actor, params.id, params.topicId, body)),
);
