import { familyLinkSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { linkSibling } from "@/server/services/students/families.service";

/** Links a sibling (A-123); makes the family when neither student has one. */
export const POST = route<typeof familyLinkSchema._output, { id: string }>(
  { permission: "students.update", body: familyLinkSchema },
  async ({ current, body, params }) =>
    json(await linkSibling(current.actor, params.id, body), { status: 201 }),
);
