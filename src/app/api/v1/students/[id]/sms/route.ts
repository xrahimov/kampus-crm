import { json, route } from "@/server/http/handler";
import { listStudentSms } from "@/server/services/sms/sms.service";

type Params = { id: string };

/** Student profile → SMS tab (EXP §6). */
export const GET = route<undefined, Params>({}, async ({ current, params }) =>
  json(await listStudentSms(current.actor, params.id)),
);
