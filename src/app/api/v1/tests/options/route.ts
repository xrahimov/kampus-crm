import { json, route } from "@/server/http/handler";
import { getTestOptions } from "@/server/services/tests/tests.service";

export const GET = route({ permission: "tests.view" }, async ({ current }) =>
  json(await getTestOptions(current.actor)),
);
