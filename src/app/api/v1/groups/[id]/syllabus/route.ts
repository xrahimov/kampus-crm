import { json, route } from "@/server/http/handler";
import { getGroupSyllabus } from "@/server/services/settings/syllabus.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getGroupSyllabus(current.actor, params.id)),
);
