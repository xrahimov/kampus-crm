import { json, route } from "@/server/http/handler";
import { listGroupTests } from "@/server/services/tests/tests.service";

type Params = { id: string };

/** Group → TEST tab (EXP §5). */
export const GET = route<undefined, Params>(
  { permission: "tests.view" },
  async ({ current, params }) => json(await listGroupTests(current.actor, params.id)),
);
