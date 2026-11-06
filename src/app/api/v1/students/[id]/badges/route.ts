import { json, route } from "@/server/http/handler";
import { listStudentBadges } from "@/server/services/badges/badges.service";

/** Student profile → Progress: badges earned and still locked (A-163). */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await listStudentBadges(current.actor, params.id)),
);
