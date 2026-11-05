import { json, route } from "@/server/http/handler";
import { listExerciseResults } from "@/server/services/exercises/exercises.service";

type Params = { id: string };

/** Best go per student on the exercise, within the caller's groups (A-158). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listExerciseResults(current.actor, params.id)),
);
