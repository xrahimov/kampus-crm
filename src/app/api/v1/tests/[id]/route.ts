import { testSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { deleteTest, getTest, updateTest } from "@/server/services/tests/tests.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "tests.view" },
  async ({ current, params }) => json(await getTest(current.actor, params.id)),
);

export const PATCH = route<typeof testSchema._output, Params>(
  { permission: "tests.update", body: testSchema },
  async ({ current, body, params }) => json(await updateTest(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "tests.delete" },
  async ({ current, params }) => {
    await deleteTest(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
