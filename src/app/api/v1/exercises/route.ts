import { exerciseListQuerySchema, exerciseSchema } from "@/lib/validation/exercises";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { createExercise, listExercises } from "@/server/services/exercises/exercises.service";

/** The exercises on a topic (`?topicId=`) or a homework (`?homeworkId=`) (A-158). */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const parsed = exerciseListQuerySchema.safeParse({
    topicId: params.get("topicId") ?? undefined,
    homeworkId: params.get("homeworkId") ?? undefined,
  });
  if (!parsed.success) throw AppError.validation({ topicId: ["validation.required"] });
  return json(await listExercises(current.actor, parsed.data));
});

/** Adds an exercise; the service decides who may write. */
export const POST = route<typeof exerciseSchema._output>(
  { permission: "groups.view", body: exerciseSchema },
  async ({ current, body }) => json(await createExercise(current.actor, body), { status: 201 }),
);
