import { json, route } from "@/server/http/handler";
import { listStudentCoins } from "@/server/services/coins/coins.service";

type Params = { id: string };

/** A student's coin balance and history ("KO'RISH" in the rating, EXP §10). */
export const GET = route<undefined, Params>({}, async ({ current, params }) =>
  json(await listStudentCoins(current.actor, params.id)),
);
