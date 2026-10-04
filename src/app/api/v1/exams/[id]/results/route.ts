import { examResultsSchema } from "@/lib/validation/exams";
import { json, route } from "@/server/http/handler";
import { getExamResults, setExamResults } from "@/server/services/exams/exams.service";

type Params = { id: string };

/** The grading sheet: group members (or mock registrations) with their scores. */
export const GET = route<undefined, Params>(
  { permission: "exams.view" },
  async ({ current, params }) => json(await getExamResults(current.actor, params.id)),
);

/** Saves scores, presence and comments for the listed students. */
export const PUT = route<typeof examResultsSchema._output, Params>(
  { permission: "exams.update", body: examResultsSchema },
  async ({ current, body, params }) => json(await setExamResults(current.actor, params.id, body)),
);
