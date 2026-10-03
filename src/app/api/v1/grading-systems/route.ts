import { gradingSystemSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  createGradingSystem,
  listGradingSystems,
} from "@/server/services/settings/grading-systems.service";

export const GET = route({}, async ({ current }) =>
  json({ items: await listGradingSystems(current.actor) }),
);

export const POST = route(
  { permission: "settings.org", body: gradingSystemSchema },
  async ({ current, body }) =>
    json(await createGradingSystem(current.actor, body), { status: 201 }),
);
