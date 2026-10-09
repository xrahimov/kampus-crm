import { json, route } from "@/server/http/handler";
import { getFamilyLink } from "@/server/services/students/family-portal.service";

type Params = { id: string };

/** The family's parents' page link (A-130), or null when the student has no family. */
export const GET = route<undefined, Params>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getFamilyLink(current.actor, params.id)),
);

/** A new link; the old one stops working. */
export const POST = route<undefined, Params>(
  { permission: "students.update" },
  async ({ current, params }) =>
    json(await getFamilyLink(current.actor, params.id, { reset: true })),
);
