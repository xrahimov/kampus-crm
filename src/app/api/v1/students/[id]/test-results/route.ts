import { knowledgeFilterSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { getStudentTestResults } from "@/server/services/tests/tests.service";

import { parseQuery } from "../../../finance/_query";

type Params = { id: string };

/** Student → TEST NATIJALARI (EXP §6): `?subject&testId&from&to`. */
export const GET = route<undefined, Params>(
  { permission: "students.view" },
  async ({ current, params, request }) =>
    json(
      await getStudentTestResults(
        current.actor,
        params.id,
        parseQuery(request, ["subject", "testId", "from", "to"], knowledgeFilterSchema),
      ),
    ),
);
