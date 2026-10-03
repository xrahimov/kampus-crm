import { z } from "zod";

import { json, route } from "@/server/http/handler";
import { getStudent, setBlacklisted } from "@/server/services/students/students.service";

const schema = z.object({ value: z.boolean().default(true) });

/** "Qora ro'yxatga olish" and its undo. */
export const POST = route<typeof schema._output, { id: string }>(
  { permission: "students.blacklist", body: schema },
  async ({ current, body, params }) => {
    await setBlacklisted(current.actor, params.id, body.value);
    return json(await getStudent(current.actor, params.id));
  },
);
