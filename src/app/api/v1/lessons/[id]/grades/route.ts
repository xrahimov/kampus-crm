import { gradesSchema } from "@/lib/validation/groups";
import { route } from "@/server/http/handler";
import { setGrades } from "@/server/services/groups/lessons.service";

export const PUT = route<typeof gradesSchema._output, { id: string }>(
  { permission: "groups.attendance.mark", body: gradesSchema },
  async ({ current, body, params }) => {
    await setGrades(current.actor, params.id, body.grades);
    return new Response(null, { status: 204 });
  },
);
