import { vocabWordsSchema } from "@/lib/validation/vocab";
import { json, route } from "@/server/http/handler";
import { listTopicWords, setTopicWords } from "@/server/services/vocab/vocab.service";

type Params = { id: string };

/** The words of a syllabus topic for the vocabulary trainer (A-165). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listTopicWords(current.actor, params.id)),
);

/** Replaces the list; the service checks the catalogue right or teaching the course. */
export const PUT = route<typeof vocabWordsSchema._output, Params>(
  { permission: "groups.view", body: vocabWordsSchema },
  async ({ current, params, body }) => json(await setTopicWords(current.actor, params.id, body)),
);
