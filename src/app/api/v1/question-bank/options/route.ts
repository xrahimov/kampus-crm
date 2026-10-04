import { json, route } from "@/server/http/handler";
import { getQuestionBankOptions } from "@/server/services/tests/questions.service";

export const GET = route({ permission: "tests.view" }, async ({ current }) =>
  json(await getQuestionBankOptions(current.actor)),
);
