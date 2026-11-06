import { json, route } from "@/server/http/handler";
import { getGroupGradebook } from "@/server/services/gradebook/gradebook.service";

type Params = { id: string };

/** The group's gradebook: each student's categories, final grade and level (A-162). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getGroupGradebook(current.actor, params.id)),
);
