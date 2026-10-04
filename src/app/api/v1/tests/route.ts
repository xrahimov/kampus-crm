import { testFilterSchema, testSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { createTest, listTests } from "@/server/services/tests/tests.service";

import { parseQuery } from "../finance/_query";

/** Settings → Testlar: list with KPIs; `?status&subject&groupId&recent=1`. */
export const GET = route({ permission: "tests.view" }, async ({ current, request }) =>
  json(
    await listTests(
      current.actor,
      parseQuery(request, ["status", "subject", "groupId", "recent"], testFilterSchema),
    ),
  ),
);

/** "Yangi test yaratish". */
export const POST = route<typeof testSchema._output>(
  { permission: "tests.create", body: testSchema },
  async ({ current, body }) => json(await createTest(current.actor, body), { status: 201 }),
);
