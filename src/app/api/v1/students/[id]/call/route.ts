import { startCallSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { startCall } from "@/server/services/calls/calls.service";

type Params = { id: string };

/** Click-to-call from the profile (A-86). */
export const POST = route<typeof startCallSchema._output, Params>(
  { permission: "students.view", body: startCallSchema },
  async ({ current, body, params }) =>
    json(await startCall(current.actor, params.id, body.phone), { status: 201 }),
);
