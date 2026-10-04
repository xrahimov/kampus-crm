import { z } from "zod";

import { TEST_STATUSES } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { setTestStatus } from "@/server/services/tests/tests.service";

type Params = { id: string };
const statusSchema = z.object({ status: z.enum(TEST_STATUSES) });

/** Draft → active → closed. */
export const POST = route<typeof statusSchema._output, Params>(
  { permission: "tests.update", body: statusSchema },
  async ({ current, body, params }) =>
    json(await setTestStatus(current.actor, params.id, body.status)),
);
