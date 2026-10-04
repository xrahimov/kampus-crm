import { questionFilterSchema, questionSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { parseListQuery } from "@/server/http/list-query";
import {
  createQuestion,
  listQuestions,
  QUESTION_SORT_FIELDS,
} from "@/server/services/tests/questions.service";

import { parseQuery } from "../finance/_query";

/** Settings → Savollar banki. */
export const GET = route({ permission: "tests.view" }, async ({ current, request }) => {
  const list = parseListQuery(request.nextUrl.searchParams, {
    sortable: QUESTION_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const filters = parseQuery(request, ["subject", "topic"], questionFilterSchema);
  return json(await listQuestions(current.actor, list, filters));
});

export const POST = route<typeof questionSchema._output>(
  { permission: "tests.create", body: questionSchema },
  async ({ current, body }) => json(await createQuestion(current.actor, body), { status: 201 }),
);
