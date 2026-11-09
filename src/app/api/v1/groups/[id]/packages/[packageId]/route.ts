import { lessonPackageUpdateSchema } from "@/lib/validation/packages";
import { json, route } from "@/server/http/handler";
import {
  deleteLessonPackage,
  updateLessonPackage,
} from "@/server/services/students/packages.service";

type Params = { id: string; packageId: string };

export const PATCH = route<typeof lessonPackageUpdateSchema._output, Params>(
  { permission: "groups.update", body: lessonPackageUpdateSchema },
  async ({ current, body, params }) =>
    json(await updateLessonPackage(current.actor, params.id, params.packageId, body)),
);

/** Removes an unsold package; a sold one is only deactivated. */
export const DELETE = route<undefined, Params>(
  { permission: "groups.update" },
  async ({ current, params }) => {
    await deleteLessonPackage(current.actor, params.id, params.packageId);
    return new Response(null, { status: 204 });
  },
);
