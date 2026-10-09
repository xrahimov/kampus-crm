import { familyUpdateSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { updateFamily } from "@/server/services/students/families.service";

/** Renames a family or changes its discount percent (A-123). */
export const PATCH = route<typeof familyUpdateSchema._output, { id: string }>(
  { permission: "students.update", body: familyUpdateSchema },
  async ({ current, body, params }) => json(await updateFamily(current.actor, params.id, body)),
);
