import { staffUpdateSchema } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import {
  archiveTeacher,
  getTeacher,
  updateTeacher,
} from "@/server/services/staff/teachers.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "teachers.view" },
  async ({ current, params }) => json(await getTeacher(current.actor, params.id)),
);

export const PATCH = route<typeof staffUpdateSchema._output, Params>(
  { permission: "teachers.update", body: staffUpdateSchema },
  async ({ current, body, params }) => json(await updateTeacher(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "teachers.delete" },
  async ({ current, params }) => {
    await archiveTeacher(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
