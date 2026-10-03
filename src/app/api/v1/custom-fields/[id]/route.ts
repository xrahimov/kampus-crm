import { route } from "@/server/http/handler";
import { deleteCustomField } from "@/server/services/students/students.service";

export const DELETE = route<undefined, { id: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await deleteCustomField(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
