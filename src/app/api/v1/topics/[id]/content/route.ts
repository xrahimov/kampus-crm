import { topicContentSchema } from "@/lib/validation/topic-content";
import { json, route } from "@/server/http/handler";
import { getTopicContent, setTopicContent } from "@/server/services/settings/topic-content.service";

type Params = { id: string };

/** The lesson content of a syllabus topic (A-157): anyone who sees groups may read it. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getTopicContent(current.actor, params.id)),
);

/** Replaces the blocks; the service decides who may write (catalogue right or a teacher of the course). */
export const PUT = route<typeof topicContentSchema._output, Params>(
  { permission: "groups.view", body: topicContentSchema },
  async ({ current, body, params }) => json(await setTopicContent(current.actor, params.id, body)),
);
