import { extraLessonSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { addExtraLesson } from "@/server/services/groups/lessons.service";

export const POST = route<typeof extraLessonSchema._output, { id: string }>(
  { permission: "groups.update", body: extraLessonSchema },
  async ({ current, body, params }) =>
    json(await addExtraLesson(current.actor, params.id, body), { status: 201 }),
);
