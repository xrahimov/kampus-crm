import { json, route } from "@/server/http/handler";
import { signOutEverywhere } from "@/server/services/staff/staff.service";

type Params = { id: string };

export const POST = route<undefined, Params>(
  { permission: "teachers.update" },
  async ({ current, params }) =>
    json({ revoked: await signOutEverywhere(current.actor, "teachers", params.id) }),
);
