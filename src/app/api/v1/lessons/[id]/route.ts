import { lessonUpdateSchema } from "@/lib/validation/groups";
import { route } from "@/server/http/handler";
import { updateLesson } from "@/server/services/groups/lessons.service";

export const PATCH = route<typeof lessonUpdateSchema._output, { id: string }>(
  { permission: "groups.attendance.mark", body: lessonUpdateSchema },
  async ({ current, body, params }) => {
    await updateLesson(current.actor, params.id, body);
    return new Response(null, { status: 204 });
  },
);
