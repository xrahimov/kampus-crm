import { exerciseBodySchema } from "@/lib/validation/exercises";
import { json, route } from "@/server/http/handler";
import {
  deleteExercise,
  getExercise,
  updateExercise,
} from "@/server/services/exercises/exercises.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getExercise(current.actor, params.id)),
);

export const PUT = route<typeof exerciseBodySchema._output, Params>(
  { permission: "groups.view", body: exerciseBodySchema },
  async ({ current, body, params }) => json(await updateExercise(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => {
    await deleteExercise(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
