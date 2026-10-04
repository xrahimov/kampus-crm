import { knowledgeFilterSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { getGroupKnowledge } from "@/server/services/tests/tests.service";

import { parseQuery } from "../../../finance/_query";

type Params = { id: string };

/** Group → BILIM TAHLILI (EXP §5): `?subject&testId&from&to`. */
export const GET = route<undefined, Params>(
  { permission: "tests.view" },
  async ({ current, params, request }) =>
    json(
      await getGroupKnowledge(
        current.actor,
        params.id,
        parseQuery(request, ["subject", "testId", "from", "to"], knowledgeFilterSchema),
      ),
    ),
);
