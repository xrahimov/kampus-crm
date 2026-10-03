import { z } from "zod";

import { idSchema } from "@/lib/validation/common";
import { json, route } from "@/server/http/handler";
import { activateStudents } from "@/server/services/groups/memberships.service";

const schema = z.object({ studentIds: z.array(idSchema).min(1).max(200) });

/** "FAOLLASHTIRISH" on the students list (EXP §6, A-68). */
export const POST = route<z.infer<typeof schema>>(
  { permission: "groups.update", body: schema },
  async ({ current, body }) =>
    json({ activated: await activateStudents(current.actor, body.studentIds) }),
);
