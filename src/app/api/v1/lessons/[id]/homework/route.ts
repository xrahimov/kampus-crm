import { homeworkSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { setHomework } from "@/server/services/homework/homework.service";

type Params = { id: string };

/** Sets or replaces the lesson's homework. */
export const PUT = route<typeof homeworkSchema._output, Params>(
  { permission: "groups.attendance.mark", body: homeworkSchema },
  async ({ current, body, params }) => json(await setHomework(current.actor, params.id, body)),
);
