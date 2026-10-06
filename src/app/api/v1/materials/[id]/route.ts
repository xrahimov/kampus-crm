import { route } from "@/server/http/handler";
import { deleteMaterial } from "@/server/services/materials/materials.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await deleteMaterial(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
