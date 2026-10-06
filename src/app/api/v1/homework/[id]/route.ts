import { route } from "@/server/http/handler";
import { deleteHomework } from "@/server/services/homework/homework.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await deleteHomework(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
