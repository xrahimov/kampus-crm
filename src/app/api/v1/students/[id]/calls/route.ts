import { json, route } from "@/server/http/handler";
import { listStudentCalls } from "@/server/services/calls/calls.service";

type Params = { id: string };

/** Student profile → CALLS tab (EXP §6). */
export const GET = route<undefined, Params>({}, async ({ current, params }) =>
  json(await listStudentCalls(current.actor, params.id)),
);
