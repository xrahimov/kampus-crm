import { lessonPackageSchema } from "@/lib/validation/packages";
import { json, route } from "@/server/http/handler";
import {
  createLessonPackage,
  listGroupPackages,
} from "@/server/services/students/packages.service";

type Params = { id: string };

/** The group's lesson packages, every member's credits and the sales (A-178). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupPackages(current.actor, params.id)),
);

export const POST = route<typeof lessonPackageSchema._output, Params>(
  { permission: "groups.update", body: lessonPackageSchema },
  async ({ current, body, params }) =>
    json(await createLessonPackage(current.actor, params.id, body), { status: 201 }),
);
