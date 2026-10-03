import { courseUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { archiveCourse, getCourse, updateCourse } from "@/server/services/settings/courses.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => json(await getCourse(current.actor, params.id)),
);

export const PATCH = route<typeof courseUpdateSchema._output, Params>(
  { permission: "settings.catalog", body: courseUpdateSchema },
  async ({ current, body, params }) => json(await updateCourse(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await archiveCourse(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
