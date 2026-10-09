import { courseSyllabusSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { getCourseSyllabus, setCourseSyllabus } from "@/server/services/settings/syllabus.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => json(await getCourseSyllabus(current.actor, params.id)),
);

export const PUT = route<typeof courseSyllabusSchema._output, Params>(
  { permission: "settings.catalog", body: courseSyllabusSchema },
  async ({ current, body, params }) =>
    json(await setCourseSyllabus(current.actor, params.id, body)),
);
