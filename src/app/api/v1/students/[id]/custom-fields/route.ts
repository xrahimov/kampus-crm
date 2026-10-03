import { customFieldSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { setCustomField } from "@/server/services/students/students.service";

/** "Yangi ma'lumot qo'shish": creates or overwrites the field with that name. */
export const POST = route<typeof customFieldSchema._output, { id: string }>(
  { permission: "students.update", body: customFieldSchema },
  async ({ current, body, params }) =>
    json(await setCustomField(current.actor, params.id, body), { status: 201 }),
);
