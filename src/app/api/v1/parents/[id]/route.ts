import { route } from "@/server/http/handler";
import { deleteParent } from "@/server/services/students/students.service";

export const DELETE = route<undefined, { id: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await deleteParent(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
