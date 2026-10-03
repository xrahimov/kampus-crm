import { gradingSystemSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  deleteGradingSystem,
  updateGradingSystem,
} from "@/server/services/settings/grading-systems.service";

type Params = { id: string };

export const PUT = route<typeof gradingSystemSchema._output, Params>(
  { permission: "settings.org", body: gradingSystemSchema },
  async ({ current, body, params }) =>
    json(await updateGradingSystem(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.org" },
  async ({ current, params }) => {
    await deleteGradingSystem(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
