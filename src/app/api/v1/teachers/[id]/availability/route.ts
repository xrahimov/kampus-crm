import { availabilitySchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { getAvailability, setAvailability } from "@/server/services/staff/availability.service";

type Params = { id: string };

/** A teacher's hours open for 1:1 booking (A-169): the person themselves or whoever sees teachers. */
export const GET = route<undefined, Params>({}, async ({ current, params }) =>
  json(await getAvailability(current.actor, params.id)),
);

export const PUT = route<typeof availabilitySchema._output, Params>(
  { body: availabilitySchema },
  async ({ current, body, params }) => json(await setAvailability(current.actor, params.id, body)),
);
